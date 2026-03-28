import prisma from "~~/server/lib/prisma";
import { ensureDatabaseMigrations } from "~~/server/lib/db-migrations";
import { initTypeRelation } from "../utils/data";

let initTask: Promise<void> | null = null;

async function runStartupInitialization() {
  const runtimeConfig = useRuntimeConfig();

  await ensureDatabaseMigrations();

  const nums = await prisma.systemConfig.count();
  if (nums < 1) {
    await prisma.systemConfig.create({
      data: {
        id: 1,
        title: "Cashbook - 开源免费个人财务管理工具",
        description:
          "Cashbook 是一款开源免费的个人财务管理工具，旨在帮助用户更好地管理自己的财务状况。",
        keywords:
          "Cashbook, 个人财务管理, 个人记账, docker部署, 开源免费, 财务管理工具, dingdangdog, 月上老狗, lodenhu",
        version: String(runtimeConfig.appVersion),
        openRegister: false,
        createAt: new Date(),
        updateAt: new Date(),
      },
    });
    console.log("Init System Settings");
  }

  await prisma.systemConfig.update({
    data: { version: String(runtimeConfig.appVersion) },
    where: {
      id: 1,
    },
  });

  const themeCount = await prisma.systemTheme.count();
  if (themeCount < 1) {
    const lightColors = {
      background: "255 255 255",
      foreground: "15 23 42",
      surface: "248 250 252",
      surfaceMuted: "241 245 249",
      border: "226 232 240",
      muted: "100 116 139",
      primary: {
        "50": "240 253 244",
        "100": "220 252 231",
        "200": "187 247 208",
        "300": "134 239 172",
        "400": "74 222 128",
        "500": "34 197 94",
        "600": "22 163 74",
        "700": "21 128 61",
        "800": "22 101 52",
        "900": "20 83 45",
        "950": "5 46 22",
      },
      secondary: {
        "50": "248 250 252",
        "100": "241 245 249",
        "200": "226 232 240",
        "300": "203 213 225",
        "400": "148 163 184",
        "500": "100 116 139",
        "600": "71 85 105",
        "700": "51 65 85",
        "800": "30 41 59",
        "900": "15 23 42",
        "950": "2 6 23",
      },
    };

    const darkColors = {
      background: "10 10 10",
      foreground: "250 250 250",
      surface: "23 23 23",
      surfaceMuted: "38 38 38",
      border: "64 64 64",
      muted: "163 163 163",
      primary: {
        "50": "240 253 244",
        "100": "220 252 231",
        "200": "187 247 208",
        "300": "134 239 172",
        "400": "74 222 128",
        "500": "34 197 94",
        "600": "22 163 74",
        "700": "21 128 61",
        "800": "22 101 52",
        "900": "20 83 45",
        "950": "5 46 22",
      },
      secondary: {
        "50": "250 250 250",
        "100": "245 245 245",
        "200": "229 229 229",
        "300": "212 212 212",
        "400": "163 163 163",
        "500": "115 115 115",
        "600": "82 82 82",
        "700": "64 64 64",
        "800": "38 38 38",
        "900": "23 23 23",
        "950": "10 10 10",
      },
    };

    await prisma.$transaction([
      prisma.systemTheme.create({
        data: {
          code: "light-green",
          name: "亮色-白绿",
          mode: "light",
          colors: JSON.stringify(lightColors),
          isActive: true,
          isDefault: true,
          sortBy: 1,
        },
      }),
      prisma.systemTheme.create({
        data: {
          code: "dark-green",
          name: "暗色-黑绿",
          mode: "dark",
          colors: JSON.stringify(darkColors),
          isActive: true,
          isDefault: true,
          sortBy: 1,
        },
      }),
    ]);
    console.log("Init Themes");
  } else {
    for (const mode of ["light", "dark"] as const) {
      const hasDefault = await prisma.systemTheme.count({
        where: { mode, isActive: true, isDefault: true },
      });
      if (hasDefault > 0) {
        continue;
      }

      const firstActive = await prisma.systemTheme.findFirst({
        where: { mode, isActive: true },
        orderBy: [{ sortBy: "asc" }, { createdAt: "asc" }],
      });

      if (firstActive) {
        await prisma.systemTheme.update({
          where: { id: firstActive.id },
          data: { isDefault: true },
        });
      }
    }
  }

  await prisma.flow.updateMany({
    where: { eliminate: null },
    data: { eliminate: 0 },
  });
  initTypeRelation();
}

export default defineNitroPlugin(async () => {
  initTask ??= runStartupInitialization();
  await initTask;
});
