"use client";

import { useEffect, useState } from "react";

interface AmbientBackdropProps {
  variant: "login" | "workspace";
}

export function AmbientBackdrop({ variant }: AmbientBackdropProps) {
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  useEffect(() => {
    // 尊重用户系统无障碍设置（减少动画模式）或省流网络
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) {
        return;
      }
    }

    // 延迟挂载视频：优先让出网络带宽给首屏核心 HTML、CSS、JS 与数据接口
    let idleId: number | null = null;
    const timer = setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(() => setShouldLoadVideo(true), { timeout: 2000 });
      } else {
        setShouldLoadVideo(true);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, []);

  const isLogin = variant === "login";
  const posterWebp = isLogin ? "/films/signal-poster.webp" : "/films/colossus-poster.webp";
  const posterJpg = isLogin ? "/films/signal-poster.jpg" : "/films/colossus-poster.jpg";
  const videoSrc = isLogin ? "/films/signal.mp4" : "/films/colossus.mp4";

  const containerClass = isLogin ? "login-backdrop-layer" : "global-backdrop-layer";
  const posterClass = isLogin ? "login-poster-backdrop" : "global-poster-backdrop";
  const videoClass = isLogin
    ? `login-video-backdrop ${videoLoaded ? "is-loaded" : ""}`
    : `global-video-backdrop ${videoLoaded ? "is-loaded" : ""}`;

  return (
    <div className={containerClass} aria-hidden="true">
      {/* 极速首屏海报：体积仅 9KB~28KB，瞬间秒开展示经典学术画卷背景 */}
      <picture>
        <source srcSet={posterWebp} type="image/webp" />
        <img
          src={posterJpg}
          alt=""
          className={posterClass}
          loading="eager"
          decoding="async"
        />
      </picture>

      {/* 视频层：首屏资源就绪后异步挂载，并平滑淡入呈现动态采光 */}
      {shouldLoadVideo && (
        <video
          className={videoClass}
          autoPlay
          loop
          muted
          playsInline
          onCanPlay={() => setVideoLoaded(true)}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
