# Artemis

Artemis is an alternative desktop launcher for the Epic Games ecosystem, built for Fortnite first. It provides library management, uncapped downloads, live friends and presence, and a full Item Shop browser in a native desktop application.

Version 1.1.5 adds a built-in update checker, Unreal Editor for Fortnite, editable install components, and a redesigned library with dropdown filters, on top of the 1.1.0 rebuild around your full Epic collection, system tray support, launcher settings, and download history.

## Features

### Library and downloads

- Browse and install every game, app, and extra owned on your Epic account
- Grid and list views with search, sorting, and type and platform filters
- Instant loading from a local cache with artwork stored on disk
- Uncapped download speeds with pause, resume, verify, and repair
- Import games that are already installed on disk
- Per-game launch arguments and desktop shortcut creation, automatic on install
- Dedicated Downloads tab with live progress and a persistent history
- Unreal Editor for Fortnite installs and launches alongside Fortnite
- Modify Install to add or remove components such as Save the World after installing

### Launcher

- System tray icon with a quick menu for every tab and account switching
- Close to tray, close to taskbar, or quit, chosen in Settings
- Start with Windows as a proper startup app, launching quietly into the tray
- Shortcut launches are handled silently while Artemis sits in the tray
- Default install location and other preferences saved launcher-wide
- Built-in update checker that downloads and runs new releases from GitHub

### Friends and presence

- Full friends list with live online, away, and in-game status
- Real-time presence over Epic's EOS connect stream and XMPP
- Send, accept, and decline friend requests, set nicknames, block and unblock
- Incoming and outgoing request management

### Item Shop

- The current Fortnite Item Shop, laid out to match the in-game shop
- Correct section ordering and tile sizing derived from Epic's own layout data
- Prices, discounts, bundle contents, and section artwork
- Refreshes automatically on the daily shop rotation, shown in your local time
- Live V-Bucks balance for the signed-in account

### Accounts

- Multiple Epic accounts with fast switching
- Device authentication, so credentials are stored locally and never re-entered
- Account avatars taken from each account's currently equipped Fortnite outfit
- Background credential maintenance that keeps saved tokens valid

## Planned

Artemis is intended to grow into a full Fortnite companion. Planned additions include:

- Gifting items to friends directly from the launcher
- Purchasing Item Shop cosmetics without opening the game
- Save the World mission and alert overviews
- Locker browsing and management
- Broader Epic Games Store support beyond Fortnite

## Credit

Artemis uses [legendary](https://github.com/legendary-gl/legendary) by Rodney (derrod) for all game installation, download, verification, and launching. Legendary is the reason downloading and playing through Artemis works at all, and it deserves the credit for that entire layer. Artemis wraps it in a desktop interface and adds the Epic account, social, and Fortnite features around it.

Legendary is licensed under the GNU General Public License v3.0. It is not redistributed in this repository; the setup steps below download it from the official releases.

Epic Games API access is provided through [fnapi-js](https://github.com/AjaxFNC-YT/fnapi-js), and Fortnite cosmetic and Item Shop data comes from [fn-api.cc](https://fn-api.cc).

Artemis is not affiliated with, endorsed by, or associated with Epic Games.

## Building from source

### Requirements

- [Node.js](https://nodejs.org) 18 or newer
- [Rust](https://rustup.rs) with the stable toolchain, 1.88 or newer
- Microsoft Visual Studio Build Tools with the C++ desktop workload
- WebView2 runtime, which is preinstalled on current versions of Windows

### Setup

Clone the repository and install the Node dependencies:

```
git clone https://github.com/Zyhloh/artemis.git
cd artemis
npm install
```

Download the latest `legendary.exe` from the [legendary releases page](https://github.com/legendary-gl/legendary/releases) and place it in the project as the Tauri sidecar:

```
src-tauri/binaries/legendary-x86_64-pc-windows-msvc.exe
```

The filename must include the target triple exactly as shown, because Tauri resolves sidecars by platform triple. The binary is intentionally excluded from version control so that legendary is always obtained from its official source under its own license.

### Running and building

Start the app in development mode:

```
npm run dev
```

Produce a release build and Windows installer:

```
npm run build
```

The installer is written to `src-tauri/target/release/bundle/nsis/`.

## Architecture

The interface is React and TypeScript, rendered by Vite. The application shell, filesystem access, process control, and all background work are Rust, running under Tauri 2.

Several long-lived Rust threads keep state current without blocking the interface:

- Item Shop polling, which fetches on an interval and only publishes a change when the shop actually differs
- Credential maintenance, which keeps saved account tokens valid and renews them from device authentication when needed
- Profile synchronisation, which caches Epic profile data for the signed-in account
- Download and game process supervision

Application data, including account credentials and cached profile data, is stored under `%APPDATA%/Artemis`.

## License

Artemis is released under the MIT License. See [LICENSE](LICENSE) for the full text.

Third-party components retain their own licenses. Notably, legendary is licensed under the GNU General Public License v3.0 and is downloaded separately rather than distributed with this source.
