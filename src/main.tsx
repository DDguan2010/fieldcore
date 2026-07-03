import ReactDOM from "react-dom/client";
import "@material/web/button/filled-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import "@material/web/iconbutton/icon-button.js";
import "@material/web/switch/switch.js";
import "@material/web/textfield/outlined-text-field.js";
import "@material/web/tabs/tabs.js";
import "@material/web/tabs/primary-tab.js";
import "./app/theme.css";
import { App } from "./app/App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />,
);
