import { exists } from '@main/util/fs';
import { ZipTask } from '@main/util/zip';
import { Instance } from '@universal/entities/instance';
import { InstanceSchema } from '@universal/entities/instance.schema';
import { LATEST_RELEASE } from '@universal/entities/version';
import { MinecraftFolder, ResolvedVersion } from '@xmcl/core';
import { readJson } from 'fs-extra';

export async function addFilesToZipFromVersion(zipTask: ZipTask, version: ResolvedVersion, includeAssets: boolean, includeLibraries: boolean, includeVersionJar: boolean) {
    const dir = new MinecraftFolder(version.minecraftDirectory);

    // add assets
    if (includeAssets) {
        const assetsJson = dir.getAssetsIndex(version.assets);
        zipTask.addFile(assetsJson, `assets/indexes/${version.assets}.json`);
        const objects = await readJson(assetsJson).then(manifest => manifest.objects);
        for (const hash of Object.keys(objects).map(k => objects[k].hash)) {
            zipTask.addFile(dir.getAsset(hash), `assets/objects/${hash.substring(0, 2)}/${hash}`);
        }
    }

    // add libs
    if (includeLibraries) {
        for (const lib of version.libraries) {
            zipTask.addFile(dir.getLibraryByPath(lib.download.path), `libraries/${lib.download.path}`);
        }
    }

    // add version json and jar
    const versions = version.inheritances;
    for (const version of versions) {
        if (includeVersionJar && await exists(dir.getVersionJar(version))) {
            zipTask.addFile(dir.getVersionJar(version), `versions/${version}/${version}.jar`);
        }
        zipTask.addFile(dir.getVersionJson(version), `versions/${version}/${version}.json`);
    }
}
