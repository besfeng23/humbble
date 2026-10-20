# Humbble - The Open Source Dating App

Humbble is an open-source dating app alternative to Bumble. Our goal is to create a privacy-focused, feature-rich dating platform that is free from corporate control and empowers users with transparency and choice.

<img src="https://github.com/user-attachments/assets/0b412b3f-df7b-4ddf-8739-21b3084fac3b" alt="Humbble Screenshot 1" width="900"></br>
## 🚀 Features

- **Matchmaking Algorithm** – Smart and customizable matching system.
- **Privacy First** – No tracking, no data selling.
- **Real-Time Chat** – Secure messaging between matches.
- **Open-Source** – Transparent and community-driven.
- **Cross-Platform** – Available for Web, Android, and iOS.

## 💡 Why Humbble?

Many dating apps prioritize profits over user experience and privacy. Humbble is different. By making the code open-source, we invite developers to contribute, improve, and ensure fairness in online dating.

## 📸 Screenshots
<p align="center">
  <img src="https://github.com/user-attachments/assets/8e9c71be-0aaf-4874-90dc-22dd54557183" alt="Humbble Screenshot 1" width="200">
  <img src="https://github.com/user-attachments/assets/d5d01e7b-dc27-450e-91e0-68f689d810a6" alt="Humbble Screenshot 2" width="200">
  <img src="https://github.com/user-attachments/assets/e313c377-f4b0-4494-a116-e825cb37ef0d" alt="Humbble Screenshot 3" width="200">
</p></br>

## 🔧 Getting Started

### Prerequisites

- Node.js & npm installed
- React Native CLI for mobile development
- Firebase or a backend of choice for authentication and database

### Installation

```sh
git clone https://github.com/Prakashchandra-007/Humbble.git
cd Humbble
npm install
```

### Supabase auth & environment setup

1. Copy `.env.example` to `.env` (note that `.env` and `.env.*` are gitignored; never commit real credentials):

```sh
cp .env.example .env
```

2. Set your local or development Supabase project public configuration in `.env`:

- `EXPO_PUBLIC_SUPABASE_URL`: Your Supabase project URL (e.g., `https://<project-ref>.supabase.co` or `http://127.0.0.1:54321` for local Supabase CLI)
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `EXPO_PUBLIC_SUPABASE_ANON_KEY`): Your Supabase publishable / anonymous public key

> **Security note:** Only public client variables may use the `EXPO_PUBLIC_*` prefix. Never place `SUPABASE_SERVICE_ROLE_KEY`, PayPal secrets, webhook IDs, or production credentials in `.env`. When required variables are missing or set to placeholders, `lib/supabase.ts` fails closed and disables auth network calls. See [`docs/setup/P0-04-environment.md`](docs/setup/P0-04-environment.md) for the full environment contract and setup guide.

### Running the Project

For Web:

```sh
npm start
```

For Android:

```sh
npm run android
```

For iOS:

```sh
npm run ios
```

## 👥 Contributing

We welcome all contributions! If you’d like to contribute:

1. Fork the repository
2. Create a new branch (`feature-new-feature`)
3. Commit your changes (`git commit -m "Added new feature"`)
4. Push to the branch (`git push origin feature-new-feature`)
5. Create a Pull Request

Check our [CONTRIBUTING.md](https://github.com/Prakashchandra-007/humbble/blob/main/CONTRIBUTING.md) for more details.

## 📜 License

Humbble is licensed under the MIT License. See [LICENSE](https://github.com/Prakashchandra-007/humbble/blob/main/LICENSE) for details.

## 📢 Community & Support

Join the discussion on:

- [Discord](https://discord.gg/vGSWrzCF)
- [Twitter](https://x.com/prakash_cm_007)
- [GitHub Discussions](https://github.com/Prakashchandra-007/humbble/discussions)

Let's build a better dating experience together! ❤️
