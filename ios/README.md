# Homebench iOS app

A Capacitor app that loads the live site (https://homebench.app) and adds native
camera features through a Swift plugin.

| Piece | Where |
|---|---|
| App config (URL, bundle ID) | `capacitor.config.json` |
| Offline page shown if the site can't load | `capacitor-shell/error.html` |
| Plugin registration | `ios/App/App/HomebenchBridgeViewController.swift` |
| JS-facing plugin (`HomebenchAR`) | `ios/App/App/HomebenchARPlugin.swift` |
| Room scan (RoomPlan, LiDAR iPhones) | `ios/App/App/RoomScanViewController.swift` |
| AR tape measure (any ARKit iPhone) | `ios/App/App/MeasureViewController.swift` |
| Web wrapper + React hook | `src/lib/native-ar.ts` |
| Camera buttons in the room dialog | `src/routes/_authenticated/rooms.tsx` |

## First run

You need a Mac with Xcode 16 or newer and a real iPhone. ARKit doesn't run in the simulator.

```sh
bun install
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Select the **App** target, then **Signing & Capabilities**, and pick your team.
   If `app.homebench.ios` is taken, change the bundle ID here and in `capacitor.config.json`.
2. Plug in your iPhone, select it as the run destination, and press Run.
   The first build downloads Capacitor through Swift Package Manager, which takes a minute.

## How the pieces connect

The app loads the live site, so the camera buttons only appear after the web
changes (`native-ar.ts`, `rooms.tsx`, `auth.tsx`) are deployed to homebench.app.
On the website they stay hidden, because `useNativeArSupport()` reports no
support outside the app.

In the app, the **Add room / Edit room** dialog gets:

- **Scan room with camera**, shown on LiDAR iPhones only. It fills in length,
  width and ceiling height. Length and width are the room's bounding rectangle,
  aligned to its longest wall.
- A **ruler button** next to each dimension. It opens the tape measure; the last
  measurement taken fills in that field.

Both screens hand the numbers back to the web form. The existing Save button and
Supabase session handle the rest, so nothing on the native side touches sign-in.

## Testing against a local dev server

Temporarily point the app at your machine:

```json
"server": { "url": "http://YOUR-MAC-LAN-IP:3000/dashboard", "cleartext": true }
```

Run `npx cap sync ios` after any change to `capacitor.config.json`.

## Known gaps before App Store submission

- **Google sign-in is hidden in the app.** Google blocks OAuth inside embedded
  web views, so email/password is the only option there. Adding it back needs
  native Google Sign-In or `ASWebAuthenticationSession`. If you add any
  third-party login, App Store rules also require Sign in with Apple.
- **App icon and splash screen** are Capacitor placeholders. Generate real ones
  from a 1024×1024 PNG with `npx @capacitor/assets generate --ios`.
- **Minimum iOS is 16.0**, which RoomPlan requires.
