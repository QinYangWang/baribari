import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { h } from "vue";
import HomeInstall from "./HomeInstall.vue";
import HomeShowcase from "./HomeShowcase.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      // Between tagline and action buttons
      "home-hero-info-after": () => h(HomeInstall),
      "home-features-after": () => h(HomeShowcase),
    });
  },
} satisfies Theme;
