import type {NextConfig} from "next";
const config:NextConfig={output:"standalone",serverExternalPackages:["node:sqlite"],poweredByHeader:false};
export default config;
