import Vuex from 'vuex';
import { remote, ipcRenderer } from 'electron';

import universalStore from '../../universal/store';
import modules from './modules';

const store = {
    ...universalStore,
};
store.modules = {
    ...store.modules,
    ...modules,
};

const localStore = new Vuex.Store(store);
const localCommit = localStore.commit;
let lastId = 0;

ipcRenderer.on('vuex-commit', (event, mutation, id) => {
    const newId = lastId + 1;
    if (id !== newId) {
        ipcRenderer.send('vuex-sync');
    } else {
        localCommit(mutation);
        lastId = newId;
    }
});
ipcRenderer.on('vuex-sync', (event, mutations, id) => {
    console.log(`sync ${id} ${lastId}`);
    array.forEach(mul => localCommit(mul));
    lastId = id;
});

ipcRenderer.send('vuex-sync', 0);

const remoteCall = remote.require('./main').default;
localStore.commit = remoteCall.commit;
localStore.dispatch = remoteCall.dispatch;

export default localStore;
