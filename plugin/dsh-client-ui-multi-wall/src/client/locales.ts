/** `multiWall` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'toggle': '多窗口墙',
  'toggle.aria': '打开或关闭多窗口墙',
  'overlay.title': '多窗口墙',
  'overlay.close': '关闭',
  'scan': '发现实例',
  'scan.from': '起始端口',
  'scan.to': '结束端口',
  'add': '添加窗口',
  'add.placeholder': '端口号',
  'columns': '列数',
  'columns.auto': '自动',
  'refresh': '全部刷新',
  'openTab': '新标签页打开',
  'reload': '重新加载',
  'remove': '关闭窗口',
  'zoom': '放大',
  'loading': '加载中',
  'empty': '没有检测到 DSH 实例',
  'empty.hint': '先启动若干 dsh web --port <n> 实例，再点击「发现实例」或手动添加端口。',
  'status.scanning': '扫描 {from}–{to} …',
  'status.found': '发现 {count} 个实例：{ports}',
  'status.none': '区间 {from}–{to} 未发现 DSH 实例',
  'status.added': '已添加 :{port}',
  'status.portRequired': '请输入端口号',
  'status.refreshed': '已刷新全部窗口',
} satisfies Record<string, string>

/** The multi-wall namespace key union. */
export type MultiWallKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'toggle': 'Multi-Window Wall',
  'toggle.aria': 'Toggle the multi-window wall',
  'overlay.title': 'Multi-Window Wall',
  'overlay.close': 'Close',
  'scan': 'Discover',
  'scan.from': 'Start port',
  'scan.to': 'End port',
  'add': 'Add window',
  'add.placeholder': 'Port',
  'columns': 'Columns',
  'columns.auto': 'Auto',
  'refresh': 'Refresh all',
  'openTab': 'Open in new tab',
  'reload': 'Reload',
  'remove': 'Close window',
  'zoom': 'Zoom',
  'loading': 'Loading',
  'empty': 'No DSH instances found',
  'empty.hint': 'Start a few `dsh web --port <n>` instances first, then click "Discover" or add a port manually.',
  'status.scanning': 'Scanning {from}–{to} …',
  'status.found': 'Found {count} instance(s): {ports}',
  'status.none': 'No DSH instances in {from}–{to}',
  'status.added': 'Added :{port}',
  'status.portRequired': 'Enter a port number',
  'status.refreshed': 'Refreshed all windows',
} satisfies Record<MultiWallKey, string>
