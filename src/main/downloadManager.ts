import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { Task } from '@xmcl/minecraft-launcher-core';
import { Store } from 'vuex';

export default function setup(store: Store<any>, window: BrowserWindow) {
    window.webContents.session.on('will-download', (event, item, contents) => {
        const downloadTask = Task.create('download', (context) => {
            const savePath = join(app.getPath('userData'), 'temps', item.getFilename());
            if (!item.getSavePath()) item.setSavePath(savePath);

            return new Promise((resolve, reject) => {
                item.on('updated', (e) => {
                    context.update(item.getReceivedBytes(), item.getTotalBytes(), item.getURL());
                });
                item.on('done', ($event, state) => {
                    switch (state) {
                        case 'completed':
                            resolve(savePath);
                            break;
                        case 'cancelled':
                        case 'interrupted':
                        default:
                            reject(new Error(state));
                            break;
                    }
                });
            });
        });
        store.dispatch('executeTask', downloadTask);
    });
}