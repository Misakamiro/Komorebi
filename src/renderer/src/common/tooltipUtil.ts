import { StyleValue } from 'vue';
import Tooltip from '@renderer/components/Tooltip/Tooltip';
import css from './tooltipUtil.module.less';

export function useTooltip(content: string, position?: 'br' | 'r' | 't' | 'tl' | 'tr' | 'mtl', styleName: 'small' | 'large' = 'small') {
	return {
		onMouseenter: (e: MouseEvent) => {
			const rect = e.target.getBoundingClientRect();
			let style: StyleValue;
			switch (position) {
				case 'mtl':	// 鼠标左上方
					style = { top: `${e.pageY}px`, right: `${window.innerWidth - e.pageX}px` };
					break;
				case 't':	// 组件上方
					style = { bottom: `${window.innerHeight - rect.top}px`, left: `${rect.left + rect.width / 2}px`, transform: `translateX(-50%)` };
					break;
				case 'tl':	// 组件上左方
					style = { bottom: `${window.innerHeight - rect.top}px`, left: `${rect.left}px` };
					break;
				case 'tr':	// 组件上右方
					style = { bottom: `${window.innerHeight - rect.top}px`, right: `${window.innerWidth - rect.right}px` };
					break;
				case 'r':	// 组件右侧
					style = { top: `${rect.top + rect.height / 2}px`, left: `${rect.left + rect.width}px`, transform: `translateY(-50%)` };
					break;
				case 'br':	// 组件下右侧
				default:
					style = { top: `${rect.top + rect.height}px`, right: `${window.innerWidth - rect.right}px` };
					break;
			}
			Tooltip.show({ content, style, class: styleName === 'small' && css.smallTip });
		},
		onMouseleave: (e: MouseEvent) => {
			Tooltip.hide();
		},
	};
}
