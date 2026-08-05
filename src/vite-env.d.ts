/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

declare module "*.module.scss" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "*.scss";
