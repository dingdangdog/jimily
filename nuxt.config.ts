// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  ssr: false,
  css: ["~/assets/css/main.css"],
  app: {
    head: {
      title: "Jimily",
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
      meta: [
        {
          name: "description",
          content: "记米粒是支持 AI 助手 Jimi 的个人记账工具，提供便捷记账与丰富分析功能",
        },
        {
          name: "keywords",
          content:
            "Jimily,记米粒,快速记账,记账,AI记账,财务管理,个人财务,财务规划,财务分析,财务报表,财务报告,财务分析报告",
        },
        { name: "theme-color", content: "#16a34a" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
        { name: "apple-mobile-web-app-title", content: "Jimily" },
        { name: "application-name", content: "Jimily" },
        { name: "msapplication-TileColor", content: "#16a34a" },
        { name: "msapplication-tap-highlight", content: "no" },
        { name: "mobile-web-app-capable", content: "yes" },
        { property: "og:title", content: "Jimily" },
        { property: "og:description", content: "记米粒，支持 AI 助手 Jimi 的智能记账工具" },
        { property: "og:type", content: "website" },
        { property: "og:image", content: "/logo.webp" },
      ],
      link: [
        {
          rel: "manifest",
          href: "/manifest.json",
        },
        {
          rel: "shortcut icon",
          href: "/logo.webp",
        },
        {
          rel: "icon",
          href: "/logo.webp",
        },
        {
          rel: "apple-touch-icon",
          href: "/pwa/apple-icon-180.png",
        },
        {
          rel: "apple-touch-startup-image",
          href: "/pwa/apple-splash-640-1136.jpg",
          media:
            "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
        },
        {
          rel: "apple-touch-startup-image",
          href: "/pwa/apple-splash-750-1334.jpg",
          media:
            "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)",
        },
        {
          rel: "apple-touch-startup-image",
          href: "/pwa/apple-splash-1242-2208.jpg",
          media:
            "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
        },
        {
          rel: "apple-touch-startup-image",
          href: "/pwa/apple-splash-1125-2436.jpg",
          media:
            "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
        },
        {
          rel: "apple-touch-startup-image",
          href: "/pwa/apple-splash-1536-2048.jpg",
          media:
            "(min-device-width: 768px) and (max-device-width: 1024px) and (-webkit-min-device-pixel-ratio: 2) and (orientation: portrait)",
        },
      ],
    },
  },
  devServer: {
    port: 9090,
  },
  nitro: {
    experimental: {
      openAPI: true,
    },
    // routeRules: {
    //   "/api/**": { swr: true },
    // },
  },

  runtimeConfig: {
    public: {},
    appVersion: "",
    dataPath: "",
    authSecret: "",
  },

  modules: [
    "@nuxtjs/tailwindcss",
    "nuxt-echarts",
    "@pinia/nuxt",
  ],
  // 动态引入echars图表
  echarts: {
    features: ["LabelLayout", "UniversalTransition"],
    charts: ["BarChart", "LineChart", "PieChart"],
    components: [
      "DatasetComponent",
      "GridComponent",
      "TooltipComponent",
      "LegendComponent",
      "ToolboxComponent",
      "DataZoomComponent",
    ],
  },
  tailwindcss: {
    // 使用根目录的 tailwind.config.js 文件
  },
  vite: {
    resolve: {
      alias: {
        ".prisma/client/index-browser":
          "./node_modules/.prisma/client/index-browser.js",
      },
    },
    ssr: {
      noExternal: ["openai"],
    },
  },
});
