// общий тип, чтобы не было циклических импортов между EditorCanvas и Toolbar
export type FxParams = {
  enabled: boolean;
  live: boolean;
  cell: number;    // px, размер ячейки растра
  levels: number;  // 2..6
  angle: number;   // 0..90 (deg)
  dot: number;     // 0..1, плотность точки
  palette: string[]; // ровно 5 цветов HEX: [light, mid, acc1, acc2, black]
};
