
import { acrylic } from '@main/util/acrylic';
import { createI18n } from '@main/util/i18n';
import { TaskNotification } from '@universal/util/notification';
import { App, BrowserWindow, dialog, Dock, Menu, nativeImage, Notification, Tray } from 'electron';
import { EventEmitter } from 'events';
import { resolve } from 'path';
import { LauncherAppController } from '../app/LauncherAppController';
import en from './locales/en.json';
import zh from './locales/zh-CN.json';

export function focusOnClick(getWindow: () => BrowserWindow | undefined) {
    return () => {
        const window = getWindow();
        if (window && !window.isFocused()) {
            window.focus();
        }
    };
}

export function toggleVisibilityOnDoubleClick(getWindow: () => BrowserWindow | undefined) {
    return () => {
        const window = getWindow();
        if (window) {
            if (window.isVisible()) window.hide();
            else window.show();
        }
    };
}

export function forwardEvent(event: string, eventEmitter: EventEmitter, getBrowser: () => (BrowserWindow | undefined)) {
    eventEmitter.on(event, (...args: any[]) => {
        // eslint-disable-next-line no-unused-expressions
        getBrowser()?.webContents.send(event, ...args);
    });
}


const isDev = process.env.NODE_ENV === 'development';
const baseURL = isDev
    ? 'http://localhost:9080/'
    : `file://${__dirname}/`;


export default class BuiltinController extends LauncherAppController {
    private mainRef: BrowserWindow | undefined = undefined;

    private loggerRef: BrowserWindow | undefined = undefined;

    private tray: Tray | undefined = undefined;

    private dock: Dock | undefined = undefined;

    private i18n = createI18n({ en, 'zh-CN': zh }, 'en');

    private primary: BrowserWindow | undefined;

    constructor() {
        super();
    }

    createMainWindow() {
        this.mainRef = this.newWindow('main', `${baseURL}main.html`, {
            title: 'VoxeLauncher',
            width: 800,
            height: 580,
            resizable: false,
            frame: false,
            transparent: true,
            hasShadow: false,
            maximizable: false,
            vibrancy: 'sidebar', // or popover
            icon: resolve(__static, 'apple-touch-icon.png'),
        });
        this.mainRef.show();

        if (this.managers.appManager.platform.name === 'windows') {
            setTimeout(() => {
                this.managers.appManager.log(`[Acrylic] Set window transparent ${this.mainRef!.webContents.getOSProcessId()}`);
                acrylic(this.mainRef!.webContents.getOSProcessId()).then((e) => {
                    this.managers.appManager.log(`[Acrylic] ${e}`);
                }, (e) => {
                    this.managers.appManager.error(`[Acrylic] ${e}`);
                });
            }, 100);
        }
    }

    createLoggerWindow() {
        this.loggerRef = this.newWindow('logger', `${baseURL}logger.html`, {
            title: 'VoxeLauncher',
            width: 770,
            height: 580,
            frame: false,
            transparent: true,
            hasShadow: false,
            maximizable: false,
            icon: resolve(__static, 'apple-touch-icon.png'),
        });
    }

    setup(): void {
        this.app.allowRendererProcessReuse = true;
    }

    async requestOpenExternalUrl(url: string) {
        const { t: $t } = this.i18n;
        const result = await dialog.showMessageBox(BrowserWindow.getAllWindows()[0], {
            type: 'question',
            title: $t('openUrl.title', { url }),
            message: $t('openUrl.message', { url }),
            checkboxLabel: $t('openUrl.trust'),
            buttons: [$t('openUrl.cancel'), $t('openUrl.yes')],
        });
        return result.response === 1;
    }

    private createMenu(app: App) {
        const { t: $t } = this.i18n;
        return Menu.buildFromTemplate([
            { type: 'normal', label: $t('checkUpdate') },
            { type: 'separator' },
            {
                label: $t('showDiagnosis'),
                type: 'normal',
                click() {
                    const cpu = process.getCPUUsage();
                    const mem = process.getProcessMemoryInfo();

                    const p: Promise<Electron.ProcessMemoryInfo> = mem instanceof Promise ? mem : Promise.resolve(mem);
                    p.then((m) => {
                        let cpuPercentage = (cpu.percentCPUUsage * 100).toFixed(2);
                        let messages = [
                            `Mode: ${process.env.NODE_ENV}`,
                            `CPU: ${cpuPercentage}%`,
                            `Private Memory: ${m.private}KB`,
                            `Shared Memory: ${m.shared}KB`,
                            `Physically Memory: ${m.residentSet}KB`,
                        ];
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'Diagnosis Info',
                            message: `${messages.join('\n')}`,
                        });
                    });
                },
            },
            { type: 'separator' },
            {
                label: $t('quit'),
                type: 'normal',
                click() {
                    app.quit();
                },
            },
        ]);
    }

    private setupTray(app: Electron.App) {
        const img = nativeImage.createFromPath(`${__static}/favicon@2x.png`);
        const tray = new Tray(img);
        tray.setContextMenu(this.createMenu(app));

        const { t: $t } = this.i18n;

        tray.on('click', focusOnClick(() => this.primary))
            .on('double-click', toggleVisibilityOnDoubleClick(() => this.primary));
        this.tray = tray;
        this.app.on('locale-changed', () => {
            if (tray) {
                tray.setToolTip($t('title'));
                tray.setContextMenu(this.createMenu(app));
            }
        });
        if (app.dock) {
            this.dock = app.dock;
            this.dock.setIcon(nativeImage.createFromPath(`${__static}/apple-touch-icon.png`));
        }
    }

    onMinecraftWindowReady() {
        const { getters } = this.store;
        if (this.mainRef && this.mainRef.isVisible()) {
            this.mainRef.webContents.send('minecraft-window-ready');
            const { hideLauncher } = getters.instance;
            if (hideLauncher) {
                this.mainRef.hide();
            }
        }

        if (this.loggerRef === undefined && getters.instance.showLog) {
            this.createLoggerWindow();
        }

        const click = () => {
            if (!this.loggerRef) {
                this.createLoggerWindow();
            } else if (!this.loggerRef.isVisible()) {
                this.loggerRef.show();
            } else {
                this.loggerRef.focus();
            }
        };

        if (this.dock) {
            this.dock.setMenu(Menu.buildFromTemplate([{
                label: 'Show Log',
                type: 'normal',
                click,
            }]));
        }
    }

    onMinecraftExited(status: any) {
        const { hideLauncher } = this.store.getters.instance;
        if (hideLauncher) {
            if (this.mainRef) {
                this.mainRef.show();
            }
        }
        if (this.mainRef) {
            this.mainRef.webContents.send('minecraft-exit', status);
        }
        if (this.loggerRef) {
            this.loggerRef.close();
            this.loggerRef = undefined;
        }
    }

    appReady(app: App) {
        this.createMainWindow();
        this.setupTray(app);
        this.setupTask();

        forwardEvent('minecraft-stdout', app, () => this.loggerRef);
        forwardEvent('minecraft-stderr', app, () => this.loggerRef);

        this.app
            .on('minecraft-window-ready', this.onMinecraftWindowReady.bind(this))
            .on('minecraft-exit', this.onMinecraftExited.bind(this));
    }

    async dataReady(): Promise<void> {
        this.mainRef!.show();
        this.store.subscribe((mutation) => {
            if (mutation.type === 'locale') {
                this.i18n.use(mutation.payload);
            }
        });
        this.i18n.use(this.store.state.setting.locale);
    }

    get activeWindow() {
        return this.mainRef ?? this.loggerRef;
    }

    private setupTask() {
        const $t = this.i18n.t;
        const tasks = this.managers.taskManager;
        tasks.runtime.on('update', ({ progress, total }, node) => {
            if (tasks.getActiveTask()?.root.id === node.id && progress && total) {
                // eslint-disable-next-line no-unused-expressions
                if (this.activeWindow && !this.activeWindow.isDestroyed()) {
                    this.activeWindow.setProgressBar(progress / total);
                }
            }
        });
        tasks.runtime.on('finish', (_, node) => {
            if (tasks.getActiveTask()?.root.id === node.id) {
                // eslint-disable-next-line no-unused-expressions
                if (this.activeWindow && !this.activeWindow.isDestroyed()) {
                    this.activeWindow.setProgressBar(-1);
                }
            }
            if (tasks.isRootTask(node.id)) {
                this.notify({ type: 'taskFinish', name: node.path, arguments: node.arguments });
            }
        });
        tasks.runtime.on('fail', (_, node) => {
            if (tasks.getActiveTask()?.root.id === node.id) {
                // eslint-disable-next-line no-unused-expressions
                if (this.activeWindow && !this.activeWindow.isDestroyed()) {
                    this.activeWindow.setProgressBar(-1);
                }
            }
            if (tasks.isRootTask(node.id)) {
                this.notify({ type: 'taskFail', name: node.path, arguments: node.arguments });
            }
        });
        tasks.runtime.on('execute', (node, parent) => {
            if (!parent) {
                this.notify({ type: 'taskStart', name: node.path, arguments: node.arguments });
            }
        });
    }

    private notify(n: TaskNotification) {
        const $t = this.i18n.t;
        if (this.activeWindow && this.activeWindow.isFocused()) {
            this.activeWindow.webContents.send('notification', n);
        } else if (n.type === 'taskFinish' || n.type === 'taskFail') {
            let notification = new Notification({
                title: n.type === 'taskFinish' ? $t('task.success') : $t('task.fail'),
                body: $t('task.continue'),
                icon: resolve(__static, 'apple-touch-icon.png'),
            });
            notification.show();
            notification.on('click', () => {
                if (this.activeWindow?.isVisible()) {
                    this.activeWindow.focus();
                } else {
                    // eslint-disable-next-line no-unused-expressions
                    this.activeWindow?.show();
                }
            });
        }
    }
}