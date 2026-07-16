import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// アイコンフォントを自ホスト化（CDN不達でもアイコンが表示され、ボタンが押せる状態を保つ）。
// 以前は index.html で jsDelivr CDN から読み込んでいたが、オフライン/CDN遮断時に
// アイコンが無地になりパディングの無いボタンが実質押せなくなる問題があった。
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
