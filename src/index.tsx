import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";


const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

// Firestore 12.9.0 has a known watch-stream race when React StrictMode
// mounts/unmounts realtime listeners twice in development. Keep the normal
// single mount lifecycle so the SDK does not receive a rapid listen teardown
// followed by a second listen on the same WebChannel.
root.render(<App />);
