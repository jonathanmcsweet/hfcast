# Publishing setup — the steps a person must do

The build and the release workflow are written. These steps cannot be
automated, because they need accounts, a secret key, and decisions that
belong to the owner of the project.

Do them in this order. Steps 1 to 5 are necessary before the first
release. Steps 6 and 7 come later.

Text in `ANGLE BRACKETS` is a placeholder. Replace it.

## 1. Clone the repo

```
hfcast/
├── mobile/
├── server/
├── docs/
└── tools/
```

`mobile/` and `server/` are directories of repository 1. Do not make a
repository for either.


## 2. Make `<ACCOUNT>/hfcast`

```bash
cd ..
git remote add origin git@github.com:<ACCOUNT>/hfcast.git
git push -u origin main
```

## 3. Make the signing key

**This is the most important step, and it cannot be undone.** Android
identifies an application by its signature. If the key is lost, no
person who installed the application can update it. They must remove it
first, and they lose their settings.

Make the key on a machine you control. Do not make it on a build
server, and do not put it in a repository.

```bash
keytool -genkeypair -v \
  -keystore hfcast-release.jks \
  -alias hfcast \
  -keyalg RSA -keysize 4096 -validity 10000
```

`keytool` asks for two passwords and for a name and an organisation.
The name is written into the certificate and users can read it.

Then keep the file safe:

- Copy it to an encrypted backup that is not on the build machine.
- Write the two passwords in a password manager.
- Do not put the file in either repository.

## 4. Add the four repository secrets

GitHub Actions reads the key from secrets. Open
`https://github.com/<ACCOUNT>/hfcast/settings/secrets/actions` and add
four.

First make the base64 text of the keystore:

```bash
base64 -w0 hfcast-release.jks > keystore.b64
```

| Secret name             | Value                             |
| ----------------------- | --------------------------------- |
| `HFCAST_STORE_BASE64`   | the contents of `keystore.b64`    |
| `HFCAST_STORE_PASSWORD` | the keystore password from step 3 |
| `HFCAST_KEY_ALIAS`      | `hfcast`                          |
| `HFCAST_KEY_PASSWORD`   | the key password from step 3      |

Then delete `keystore.b64`. It holds the key.

```bash
shred -u keystore.b64
```

The workflow stops with an error if these secrets are absent. It does
not make an unsigned release.

### To build a signed APK on your own machine

The same four values, as Gradle properties in
`~/.gradle/gradle.properties`. This file is outside the repository.

```
HFCAST_STORE_FILE=/home/<YOU>/keys/hfcast-release.jks
HFCAST_STORE_PASSWORD=<PASSWORD>
HFCAST_KEY_ALIAS=hfcast
HFCAST_KEY_PASSWORD=<PASSWORD>
```

Without them the build uses the Android debug key. That build runs, but
it cannot update an installation made from a signed one.

## 5. Put the privacy policy on the web

F-Droid and Accrescent both need a link to a privacy policy. A file in
a repository is not sufficient. The text is in `mobile/docs/privacy.md`.

The cheapest method is GitHub Pages:

1. Open `https://github.com/<ACCOUNT>/hfcast/settings/pages`.
2. Set the source to `main` and the folder to `/docs`.
3. Wait for the build. The address is
   `https://<ACCOUNT>.github.io/hfcast/`.

Then put that address in the README and in each store listing.

## 6. Make the first release

```bash
git tag v0.54.2
git push origin v0.54.2
```

The workflow builds four APKs, signs them, and makes a **draft**
release. Open it, read the notes, attach the screenshots if you want
them there, and publish it.

Then test one file on a device before you tell anybody about it.

## 7. Add the application to Obtainium

Obtainium reads GitHub releases. There is no account and no review.

In Obtainium: **Add App**, then the URL
`https://github.com/<ACCOUNT>/hfcast`. Obtainium finds the releases and
chooses the correct file for the device.

Put the same URL in the README, with the Obtainium badge.

## Later: F-Droid and Accrescent

Both need more than a release, and both can wait.

**F-Droid** builds from source on its own machines and signs with its
own key. `mobile/docs/fdroid.md` holds the recipe.
`mobile/fastlane/metadata/android/en-US/` already holds the title, the
short description and the full description. What is missing is the
screenshots, a changelog for each version.

**Accrescent** wants an app bundle, not a bare APK, and you sign it
yourself. It is curated, so it needs an approach to the maintainers.

Screenshots are needed for both. Four or five is enough: the forecast,
the map, the band list, and the settings menu. One of them should show
the low-light theme.
