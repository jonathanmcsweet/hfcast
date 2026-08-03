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

use jni::objects::{JClass, JString};
use jni::sys::jstring;
use jni::JNIEnv;

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
    let text: String = match env.get_string(&request) {
        Ok(text) => text.into(),
        // Before there is a request there is nothing to answer, so this is the
        // one case that cannot be reported in the service's own shape.
        Err(e) => return error_string(&mut env, &format!("unreadable request: {e}")),
    };

    let answer = match hfcast::service::run(&text) {
        Ok(json) => json,
        // The service's failures are already JSON objects with an "error"
        // field when they come through the binary; here they arrive as a
        // message, so they are wrapped into the same shape.
        Err(message) => return error_string(&mut env, &message),
    };

    match env.new_string(answer) {
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
