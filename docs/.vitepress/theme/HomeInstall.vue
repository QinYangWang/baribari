<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useData } from "vitepress";

const { lang } = useData();
const active = ref(0);
/** idle | ok | err */
const copyState = ref<"idle" | "ok" | "err">("idle");
const status = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;

const labels = computed(() => {
  const l = lang.value || "en";
  if (l.startsWith("zh")) {
    return {
      copy: "复制",
      ok: "已复制",
      err: "复制失败",
      tablist: "安装命令",
    };
  }
  if (l.startsWith("ja")) {
    return {
      copy: "コピー",
      ok: "コピー済み",
      err: "失敗",
      tablist: "インストールコマンド",
    };
  }
  return {
    copy: "Copy",
    ok: "Copied!",
    err: "Failed",
    tablist: "Install commands",
  };
});

const tabs = [
  {
    id: "bash",
    label: "Bash",
    cmd: "npm i -g baribari && baribari setup --download && baribari",
  },
  {
    id: "powershell",
    label: "PowerShell",
    cmd: "npm i -g baribari; baribari setup --download; baribari",
  },
  {
    id: "cmd",
    label: "CMD",
    cmd: "npm i -g baribari & baribari setup --download & baribari",
  },
] as const;

const panelId = "bb-install-panel";
const tabId = (i: number) => `bb-install-tab-${tabs[i]!.id}`;

const buttonLabel = computed(() => {
  if (copyState.value === "ok") return labels.value.ok;
  if (copyState.value === "err") return labels.value.err;
  return labels.value.copy;
});

function select(i: number) {
  active.value = Math.max(0, Math.min(tabs.length - 1, i));
}

function onTabKeydown(e: KeyboardEvent, i: number) {
  let next = i;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    next = (i + 1) % tabs.length;
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    next = (i - 1 + tabs.length) % tabs.length;
  } else if (e.key === "Home") {
    next = 0;
  } else if (e.key === "End") {
    next = tabs.length - 1;
  } else {
    return;
  }
  e.preventDefault();
  select(next);
  requestAnimationFrame(() => {
    document.getElementById(tabId(next))?.focus();
  });
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function flash(state: "ok" | "err", msg: string) {
  copyState.value = state;
  status.value = msg;
  clearTimeout(timer);
  timer = setTimeout(() => {
    copyState.value = "idle";
    status.value = "";
  }, 2000);
}

async function copy() {
  const text = tabs[active.value]?.cmd ?? tabs[0].cmd;
  let ok = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    } else {
      ok = fallbackCopy(text);
    }
  } catch {
    ok = fallbackCopy(text);
  }
  if (ok) flash("ok", labels.value.ok);
  else flash("err", labels.value.err);
}

watch(active, () => {
  copyState.value = "idle";
  status.value = "";
  clearTimeout(timer);
});
</script>

<template>
  <div class="bb-install-panel">
    <div
      class="bb-install-tabs"
      role="tablist"
      :aria-label="labels.tablist"
    >
      <button
        v-for="(t, i) in tabs"
        :id="tabId(i)"
        :key="t.id"
        type="button"
        class="bb-install-tab"
        :class="{ active: active === i }"
        role="tab"
        :aria-selected="active === i"
        :aria-controls="panelId"
        :tabindex="active === i ? 0 : -1"
        @click="select(i)"
        @keydown="onTabKeydown($event, i)"
      >
        {{ t.label }}
      </button>
    </div>

    <div
      :id="panelId"
      class="bb-install-body"
      role="tabpanel"
      :aria-labelledby="tabId(active)"
    >
      <pre class="bb-install-cmd" tabindex="0"><code>{{ tabs[active].cmd }}</code></pre>
      <button
        type="button"
        class="bb-install-copy"
        :class="{
          'is-ok': copyState === 'ok',
          'is-err': copyState === 'err',
        }"
        :aria-label="`${buttonLabel}: ${tabs[active].label}`"
        @click="copy"
      >
        <span class="bb-install-copy-icon" aria-hidden="true">
          <svg
            v-if="copyState === 'ok'"
            class="bb-icon"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
          >
            <path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg
            v-else-if="copyState === 'err'"
            class="bb-icon"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
          >
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <svg
            v-else
            class="bb-icon"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
          >
            <rect
              x="5.5"
              y="5.5"
              width="7"
              height="8"
              rx="1.2"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M3.5 10.5V3.8A1.3 1.3 0 0 1 4.8 2.5H10"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <span class="bb-install-copy-text">{{ buttonLabel }}</span>
      </button>
    </div>

    <p class="bb-install-status" role="status" aria-live="polite">{{ status }}</p>
  </div>
</template>
