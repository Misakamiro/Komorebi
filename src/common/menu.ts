import { VNode } from 'vue';
import { strict2 } from './params/parameter';

export type MenuItem<E = any> = {
    type: 'normal';
	value: any;
	label: string;
	icon?: VNode;
	tooltip?: string;
	disabled?: boolean;
	onClick?: (event: Event, value: any) => boolean | void;	// true 值用于关闭菜单面板（但返回值似乎还没用到）
	extra?: E;	// 与 Menu 功能无关，用于自定义场景
} | {
    type: 'separator';
} | {
	type: 'submenu';
	label: string;
	tooltip?: string;
	subMenu: MenuItem<E>[];
	disabled?: boolean;
	key?: number; // 仅供内部使用
} | {
	type: 'checkbox' | 'radio';
	value: any;
	checked: boolean;
	label: string;
	tooltip?: string;
	disabled?: boolean;
	onClick?: (event: Event, checked: boolean) => boolean | void;	// true 值用于关闭菜单面板（但返回值似乎还没用到
};
export type NarrowedMenuItem = Extract<MenuItem, { type: 'normal' }> & strict2;

// 深度优先搜索，根据 value 获取第一个搜索到的 MenuItem
export function getMenuItemByValue<E>(menu: MenuItem<E>[], value: any, compareFunc?: (itemValue: any, yourValue: any) => boolean) {
    function dfs(menu: MenuItem<E>[]): Extract<MenuItem<E>, { type: 'normal' | 'checkbox' | 'radio' }> | undefined {
        for (const menuItem of menu) {
            if (menuItem.type === 'submenu') {
                const result = dfs(menuItem.subMenu);
                if (result) {
                    return result;
                }
            } else if ('value' in menuItem && (compareFunc ? compareFunc(menuItem.value, value) : menuItem.value === value)) {
                return menuItem;
            }
        }
    }
    return dfs(menu);
}
