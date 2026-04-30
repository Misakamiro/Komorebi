export const version = (() => {
    let ret = '5.3-alpha';
    if (!buildInfo) {
        ret += ' *'
    } else if (buildInfo.isDev) {
        ret += ` ${buildInfo.gitCommit}`
    }
    return ret;
})();
export const buildNumber = 20;
//	1.0	1.1	2.0	2.1	2.2	2.3	2.4 2.5 2.6 3.0 4.0 4.1 4.2 4.3 4.4 4.5 5.0 5.1 5.2 5.3
