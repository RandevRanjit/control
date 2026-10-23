/** GitHub Pages serves the project site under the repository's name. */
export const BASE_PATH = "/control";
export const SITE_URL = "https://randevranjit.github.io/control";
export const REPO_URL = "https://github.com/RandevRanjit/control";
export const DOWNLOAD_URL = `${REPO_URL}/releases/latest`;
export const T3_URL = "https://github.com/pingdotgg/t3code";

/** Public files need the base path spelled out; next/link and the bundles add it themselves. */
export const asset = (path: string) => `${BASE_PATH}${path}`;
