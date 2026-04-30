import { createApp } from 'vue';
import App from './App/App.vue';
import { intersect } from './App/intersect';
import { createPinia, setActivePinia } from 'pinia';

const pinia = createPinia();
setActivePinia(pinia);  // App 在构建过程中，顶层就 import 了 store，所以要在 createApp 之前就初始化好

const app = createApp(App);
// app.config.performance = true;
app.directive('intersect', intersect);
app.mount('#app');
// app.use(pinia);
