<script setup lang="ts">
import { computed } from 'vue';
import i11n from '@common/i11n/i11n';
import { version } from '@common/constants';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { useAppStore } from '@renderer/stores/appStore';

const appStore = useAppStore();

const tr = computed(() => {
	appStore.frontendSettings.language;
	return i11n.frontend.about;
});
</script>

<template>
	<div class="aboutPanel">
		<section>
			<h2>{{ tr.philosophyTitle }}</h2>
			<p v-for="item in tr.philosophyBody" :key="item">{{ item }}</p>
		</section>
		<section>
			<h2>{{ tr.creditsTitle }}</h2>
			<div class="creditList">
				<button
					v-for="item in tr.credits"
					:key="item.url"
					class="creditItem"
					@click="nodeBridge.jumpToUrl(item.url)"
				>
					<span class="creditName">{{ item.name }}</span>
					<span class="creditDesc">{{ item.description }}</span>
					<span class="creditUrl">{{ item.url }}</span>
				</button>
			</div>
		</section>
		<div class="version">Komorebi v{{ version }}</div>
	</div>
</template>

<style scoped lang="less">
	.aboutPanel {
		max-width: 760px;
		padding: 0 8px 32px;
		font-size: 14px;
		line-height: 1.7;
		color: var(--fontColor);
		animation: contentFadeIn 0.24s cubic-bezier(0.2, 0.9, 0.2, 1);
		section {
			margin-bottom: 22px;
		}
		h2 {
			margin: 0 0 10px;
			font-size: 18px;
			line-height: 1.35;
			color: var(--titleText);
		}
		p {
			margin: 0 0 8px;
		}
		.creditList {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
			gap: 10px;
		}
		.creditItem {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 4px;
			padding: 12px;
			border: 1px solid hwb(var(--highlight) / 0.7);
			border-radius: 8px;
			background: hwb(var(--bg98) / 0.72);
			color: inherit;
			text-align: left;
			font-family: inherit;
			cursor: pointer;
			box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.08);
			transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1),
				background 0.18s ease,
				box-shadow 0.18s ease;
			&:hover {
				transform: translateY(-1px);
				background: hwb(var(--bg99) / 0.88);
				box-shadow: 0 6px 16px hwb(var(--hoverShadow) / 0.13);
			}
			&:active {
				transform: translateY(0) scale(0.99);
			}
		}
		.creditName {
			font-weight: 600;
			color: var(--titleText);
		}
		.creditDesc {
			font-size: 13px;
		}
		.creditUrl {
			font-size: 12px;
			opacity: 0.72;
			word-break: break-all;
		}
		.version {
			margin-top: 16px;
			opacity: 0.72;
			font-size: 13px;
		}
	}

	@keyframes contentFadeIn {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
