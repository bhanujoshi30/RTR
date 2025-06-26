# TaskFlow Project

This is a Next.js project bootstrapped with `create-next-app` and managed in Firebase Studio. It uses Next.js, React, ShadCN UI, Tailwind CSS, and Genkit for AI features.

## Getting Started Locally

To run this project on your local machine, follow these steps.

### Prerequisites

1.  **Node.js:** Make sure you have Node.js installed. You can download it from [nodejs.org](https://nodejs.org/). This will also install `npm`.
2.  **IDE:** We recommend using [Visual Studio Code (VS Code)](https://code.visualstudio.com/).
3.  **Firebase Project:** You must have a Firebase project set up. If you don't have one, create one at the [Firebase Console](https://console.firebase.google.com/).

### 1. Set Up Environment Variables

You need to provide your Firebase project's configuration to the application.

1.  Create a new file in the root directory named `.env.local`.
2.  Copy the content from `.env.local.example` into your new `.env.local` file.
3.  Find your Firebase project's configuration keys:
    *   Go to your [Firebase Console](https://console.firebase.google.com/).
    *   Select your project.
    *   Go to **Project Settings** (click the gear icon ⚙️).
    *   In the "General" tab, under "Your apps", find your Web App.
    *   Select **Config** to view your Firebase SDK configuration keys.
4.  Copy the values from your Firebase project config into the corresponding variables in your `.env.local` file.

### 2. Install Dependencies

Open a terminal in the project's root directory and run the following command to install all the necessary packages:

```bash
npm install
```

### 3. Run the Development Servers

This project requires two separate development servers to be running simultaneously: one for the Next.js frontend and one for the Genkit AI backend.

**Terminal 1: Run the Next.js App**

This command starts the main web application.

```bash
npm run dev
```

Your app should now be running at [http://localhost:9002](http://localhost:9002).

**Terminal 2: Run the Genkit AI Services**

This command starts the Genkit server, which handles all the AI-related functionality (like generating reports).

```bash
npm run genkit:dev
```

This will start the Genkit development UI, typically on a different port (like 4000), which you can use to inspect and test your AI flows.

You are now all set up for local development!