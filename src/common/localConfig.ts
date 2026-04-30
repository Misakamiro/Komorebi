import path from 'path';
import Conf from 'conf';

const appDataPath = (
    () => { switch (process.platform) {
        case 'win32': return process.env.APPDATA;
        case 'linux': case 'android': return process.env.XDG_CONFIG_HOME || path.join(process.env.HOME, '.config');
        case 'darwin': return path.join(process.env.HOME, 'Library', 'Application Support');
    } }
)();
const komorebiConf = new Conf({ cwd: path.join(appDataPath, 'Komorebi') });
const legacyConf = new Conf({ cwd: path.join(appDataPath, 'FFBox') });

const localConfig = {
    get: async (key: string) => {
        if (!komorebiConf) {
            return undefined;
        }
        const value = komorebiConf.get(key);
        return value === undefined ? legacyConf.get(key) : value;
    },
    set: async (key: string, value: any) => {
        if (!komorebiConf) {
            return undefined;
        }
        return komorebiConf.set(key, value);
    },
    delete: async (key: string) => {
        if (!komorebiConf) {
            return undefined;
        }
        return komorebiConf.delete(key);
    },
};

export default localConfig;
