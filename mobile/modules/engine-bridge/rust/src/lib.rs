//! The engine, callable from Android.
//!
//! One JNI function over `hfcast::service::run`, which is the same entry point
//! the server reaches through the `predict` binary. Nothing about the
//! prediction happens here: this converts a Java string to Rust, calls that
//! function, and converts the answer back. Anything else belongs in the engine
//! where the parity harnesses cover it.
//!
//! Errors come back as the JSON the service produces — `{"error":"..."}` —
//! rather than as a Java exception. The caller has to handle a failed
//! prediction either way, and one shape for both means the Kotlin side has no
//! error handling of its own to get wrong. A panic is the exception: the
//! profile sets `panic = "abort"`, so a bug in the engine takes the process
//! down rather than unwinding across the JNI boundary, which is undefined.
//!
//! ## Why it can time itself
//!
//! A Pixel 8 reported 3.9 seconds for a whole-world fine grid that the same
//! engine computes in 0.17 seconds on a desktop across eight threads. Phone
//! cores are two or three times slower than desktop ones, not twenty, so most
//! of that gap is somewhere other than the arithmetic — and the three
//! candidates are on opposite sides of this file. The prediction is Rust. The
//! request and the answer cross a boundary that converts between UTF-8 and
//! Java's UTF-16, and the answer is about 2.9 MB. A total cannot tell those
//! apart, and they need completely different fixes.
//!
//! So each of the three is timed separately and written to the Android log
//! under the `hfcast` tag. It is off until `setTracingNative` turns it on, so
//! an ordinary build measures nothing and writes nothing.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jstring};
use jni::JNIEnv;

/// Whether each call writes its timings to the Android log.
///
/// `Relaxed` because nothing is ordered against it: a call that reads the
/// old value one way or the other logs, or does not log, one prediction.
static TRACING: AtomicBool = AtomicBool::new(false);

/// `com.hfcast.engine.HfcastEngineModule.setTracingNative`.
#[no_mangle]
pub extern "system" fn Java_com_hfcast_engine_HfcastEngineModule_setTracingNative(
    _env: JNIEnv<'_>,
    _class: JClass<'_>,
    on: jboolean,
) {
    TRACING.store(on != 0, Ordering::Relaxed);
}

/// `com.hfcast.engine.HfcastEngineModule.predictNative`.
///
/// The name encodes the class, so it has to match the Kotlin exactly: JNI
/// resolves `Java_<package>_<class>_<method>` with underscores in the package
/// escaped as `_1`. There are none here.
#[no_mangle]
pub extern "system" fn Java_com_hfcast_engine_HfcastEngineModule_predictNative<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    request: JString<'local>,
) -> jstring {
    let tracing = TRACING.load(Ordering::Relaxed);
    let started = Instant::now();

    let text: String = match env.get_string(&request) {
        Ok(text) => text.into(),
        // Before there is a request there is nothing to answer, so this is the
        // one case that cannot be reported in the service's own shape.
        Err(e) => return error_string(&mut env, &format!("unreadable request: {e}")),
    };
    let read = started.elapsed();

    let answer = match hfcast::service::run(&text) {
        Ok(json) => json,
        // The service's failures are already JSON objects with an "error"
        // field when they come through the binary; here they arrive as a
        // message, so they are wrapped into the same shape.
        Err(message) => return error_string(&mut env, &message),
    };
    let predicted = started.elapsed();
    let bytes = answer.len();

    let out = env.new_string(answer);
    if tracing {
        let handed = started.elapsed();
        log_line(&format!(
            "native | in {} B {} ms | predict {} ms | out {} B {} ms | total {} ms",
            text.len(),
            read.as_millis(),
            (predicted - read).as_millis(),
            bytes,
            (handed - predicted).as_millis(),
            handed.as_millis(),
        ));
    }

    match out {
        Ok(s) => s.into_raw(),
        // A prediction that cannot be handed back is not worth a second
        // attempt at allocating a longer message.
        Err(_) => std::ptr::null_mut(),
    }
}

/// The service's own error shape, so one branch handles every failure.
fn error_string(env: &mut JNIEnv<'_>, message: &str) -> jstring {
    let escaped = message.replace('\\', "\\\\").replace('"', "\\\"");
    match env.new_string(format!("{{\"error\":\"{escaped}\"}}")) {
        Ok(s) => s.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Writes one line to the Android log under the `hfcast` tag.
///
/// Straight to `liblog` rather than back across JNI to call Java's
/// `Log.i`: this is called from inside the batch's own threads, and the
/// point of the measurement is that it does not add a crossing of its
/// own to what it is measuring.
#[cfg(target_os = "android")]
fn log_line(text: &str) {
    use std::ffi::CString;
    use std::os::raw::c_char;

    // `liblog` is part of the platform and needs no crate. `ANDROID_LOG_INFO`
    // is 4.
    #[link(name = "log")]
    extern "C" {
        fn __android_log_write(prio: i32, tag: *const c_char, text: *const c_char) -> i32;
    }

    let (Ok(tag), Ok(body)) = (CString::new("hfcast"), CString::new(text)) else {
        return;
    };
    // Safe: both pointers are valid, NUL-terminated and outlive the call.
    unsafe {
        __android_log_write(4, tag.as_ptr(), body.as_ptr());
    }
}

/// Off Android there is no log to write to. The tests and the desktop
/// build of this crate still have to compile.
#[cfg(not(target_os = "android"))]
fn log_line(text: &str) {
    eprintln!("[hfcast] {text}");
}
