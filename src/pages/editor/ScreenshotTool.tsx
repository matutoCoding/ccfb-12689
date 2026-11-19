import { useState } from 'react';
import type { PlacedItem, StoreWindow } from '../../types';
import { useToast } from '../../components/ui';
import { itemSize } from '../../engine/ModelRegistry';

// 导出带尺寸标注的截图:WebGL 画面 + 2D Canvas 叠加开间/进深/地台标注
export function ScreenshotTool({ getShot, win, items }: {
  getShot: () => string;
  win: StoreWindow;
  items: PlacedItem[];
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function exportShot() {
    setBusy(true);
    try {
      const raw = getShot();
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = raw; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const W = c.width, H = c.height;

      // 半透明底条
      ctx.fillStyle = 'rgba(12,14,18,0.78)';
      ctx.fillRect(0, H - 150, W, 150);
      ctx.fillStyle = '#e8eaf0';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(`${win.storeName}  橱窗安装参照图`, 36, H - 100);
      ctx.font = '22px sans-serif';
      ctx.fillStyle = '#9aa3b2';
      ctx.fillText(`开间 ${win.width}cm × 进深 ${win.depth}cm × 净高 ${win.height}cm | 地台高 ${win.platformHeight}cm | 门洞 ${win.door.w}×${win.door.h} | 货梯 ${win.elevator.w}×${win.elevator.h}×${win.elevator.d}`, 36, H - 60);
      ctx.fillText(`道具 ${items.length} 件  导出时间 ${new Date().toLocaleString('zh-CN')}`, 36, H - 26);

      // 左上角开间标注(带尺寸线)
      drawDim(ctx, 40, 70, 320, 70, `开间 ${win.width}cm`);
      drawDim(ctx, 40, 70, 40, 260, `净高 ${win.height}cm`);

      const url = c.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${win.storeName}-陈列安装图.png`;
      a.click();
      toast.push('带尺寸标注的截图已导出');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button style={{ position: 'absolute', right: 10, bottom: 10, padding: '6px 12px' }}
      disabled={busy} onClick={exportShot}>
      📷 导出标注截图
    </button>
  );
}

function drawDim(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, label: string) {
  ctx.save();
  ctx.strokeStyle = '#ffd479';
  ctx.fillStyle = '#ffd479';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.stroke();
  // 端头
  for (const [x, y, dx, dy] of [[x1, y1, -8, -8], [x1, y1, -8, 8], [x2, y2, 8, -8], [x2, y2, 8, 8]] as const) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  }
  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  const tw = ctx.measureText(label).width;
  ctx.fillRect(Math.min(x1, x2) + 6, Math.min(y1, y2) - 28, tw + 14, 26);
  ctx.fillStyle = '#ffd479';
  ctx.fillText(label, Math.min(x1, x2) + 13, Math.min(y1, y2) - 8);
  ctx.restore();
}

// 道具尺寸清单(供确认书拼装图使用)
export function itemDims(items: PlacedItem[]): string {
  return items.map((i) => {
    const s = itemSize(i);
    return `${i.name} ${s.w.toFixed(0)}×${s.h.toFixed(0)}×${s.d.toFixed(0)}`;
  }).join('\n');
}
