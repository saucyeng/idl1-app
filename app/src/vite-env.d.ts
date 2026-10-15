/// <reference types="vite/client" />

/** Build-time variables `release.yml` sets for CI builds (`ipc/appUpdate.ts`);
 *  a local build has none. */
interface ImportMetaEnv {
  readonly VITE_RELEASE_CHANNEL?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_BUILD_NUMBER?: string;
}
