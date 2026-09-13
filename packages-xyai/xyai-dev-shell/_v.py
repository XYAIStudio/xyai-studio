from pathlib import Path
t=Path('lib/client.js').read_text(encoding='utf-8')
checks={
  '已打开': t.count('已打开'),
  'ABOUT': t.count('ABOUT'),
  '关于我们': t.count('关于我们'),
  'cnxy.ai': t.count('cnxy.ai'),
  'openModelHubSettings': '模型广场' in t and 'aria-haspopup' in t,
  'fake toast opened': 'shell.nav.opened' in t or '已打开:' in t,
  'about-html': 'XYAI 生态' in t,
  'knowledge body': '尚未组装知识库' in t,
}
for k,v in checks.items(): print(k, v)
print('size', Path('lib/client.js').stat().st_size)
