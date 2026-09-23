# デスクトップウィンドウ角丸の再実装仕様

この文書は ZCode Desktop の現行実装を、別アプリへ移植できる粒度で固定する。角丸は単一の `border-radius` ではない。外側のウィンドウ外形と、内側のコンテンツカードは別レイヤで、数値も別である。

## 1. モデル

```
OS ウィンドウ境界
└─ シェル（ウィンドウいっぱい。サイドバーの地色）
   ├─ 左ペイン: シェルそのもの。独自の border-radius は無い
   ├─ 4px の溝（リサイズハンドル）
   └─ 中央カード: 上・右・下も 4px 空け、独自半径 + 1px 枠
```

左ペインの左上・左下が丸く見えるのは、シェルの外枠クリップである。中央の四隅はカード自身の半径である。左ペインの右辺は直角のまま。

同心の式:

```
outerRadius = innerRadius + inset
```

Linux は `12 + 4 = 16`。カード角の曲率中心とウィンドウ角の曲率中心を一致させる。枠線の 1px は式に入れない。`box-sizing: border-box` の外側半径が指定値になる。

## 2. 数値

| 面               | macOS < 26 / 不明             | macOS 26+ (Tahoe) | Windows                               | Linux                                           |
| ---------------- | ----------------------------- | ----------------- | ------------------------------------- | ----------------------------------------------- |
| ウィンドウ外形   | OS ネイティブ。CSS で切らない | 同左              | Win11 は DWM ネイティブ。Win10 は直角 | CSS 16px。`border-radius` と `clip-path` の両方 |
| 内側カード       | 6px                           | 12px              | 5px                                   | 12px（`rounded-xl` = `0.75rem`）                |
| カード周囲の隙間 | 4px                           | 4px               | 4px                                   | 4px                                             |
| 最大化時の外形   | OS に任せる                   | 同左              | OS に任せる。カード半径は残す         | 半径と clip を両方 0                            |
| 最大化時のカード | 半径と枠を残す                | 同左              | 同左                                  | 同左                                            |

Windows で内側を 12px にすると、4px 隙間のあと弧が厚く見える。5px は Win11 の DWM 角（およそ 8px）に `5 + 4` で寄せた値。macOS 26 未満のネイティブ角は小さいので、内側 12px は不調和。不明バージョンは 6px に倒す。

リサイズハンドルのホバー線は、カードの直線辺に合わせる。

```
handleIndicatorInset = innerRadius + 4
```

上の 4px はカードの上余白、`innerRadius` は角の曲線分。Web には 4px 余白が無いので、この +4 は足さない。

## 3. BrowserWindow

メインウィンドウだけがこの契約。更新ダイアログは `frame: true`、`transparent: false`、直角であり、混ぜない。

### macOS

```js
{
  backgroundColor: "#00000000",
  titleBarStyle: "hidden",          // frame:false にしない。OS が角と影を描く
  trafficLightPosition: { x: 22, y: 23 },
  vibrancy: "under-window",
  visualEffectState: "active",
}
```

`transparent: true` は付けない。`hiddenInset` でもない。信号機はネイティブのまま。横位置はズームしても 22 のまま。縦だけ次式で追従し、下限は 4。

```
y = max(4, round(23 + (23 * zoomFactor - 23) * 1.5))
```

信号機の左側安全域は CSS 96px を `zoomFactor` で割る。ネイティブボタン幅はズームしないため。

### Windows

```js
{
  backgroundColor: "#00000000",
  frame: false,                      // ネイティブボタンと自絵ボタンの二重化を避ける
  backgroundMaterial: "acrylic",
}
```

`transparent: true` は付けない。`roundedCorners` も明示しない。Win11 の既定（DWM が角を付ける）に任せる。Win10 は直角。`roundedCorners: false` は強制更新ウィンドウ専用で、メインには使わない。

自絵ボタンを使うウィンドウは `titleBarOverlay` を呼ばない。呼ぶとネイティブボタンが戻る。右側安全域は 136px 固定。ボタンが CSS ズームに付いてくるので、macOS のような逆補償はしない。

### Linux

```js
{
  backgroundColor: "#00000000",
  transparent: true,
  frame: false,
  hasShadow: false,
  autoHideMenuBar: true,
}
```

不透明な `BrowserWindow` は、CSS で切った四隅を直角の黒で塗り戻す。透明は四隅をデスクトップに見せるためだけに使う。`hasShadow: false` は、一部のウィンドウマネージャが frameless ウィンドウの外に黒い縁を足すのを止めるため。macOS / Windows の影は消さない。

`clip-path` はヒットテストを変えない。透明な四隅もウィンドウ矩形の一部としてクリックを受ける。OS 形状まで一致させるなら別途 `setShape` が要る。現行実装は呼ばない。

## 4. ページの地

```css
html,
body,
#root {
  width: 100%;
  height: 100%;
  background: transparent !important;
}
```

不透明な面はシェルから塗る。ここを不透明にすると、Linux の四隅も macOS の vibrancy も潰れる。

| プラットフォーム      | シェル背景                            | 理由                                   |
| --------------------- | ------------------------------------- | -------------------------------------- |
| macOS                 | 半透明（neutral を 60% で透明と混合） | vibrancy を溝とサイドバーに通す        |
| Windows / Linux / Web | 不透明トークン                        | デスクトップ色がサイドバーに混ざらない |

中央カードは全プラットフォームで不透明な `background`。テキストの裏にデスクトップを通さない。

## 5. Linux の外枠

シェル根に、通常時だけ次を付ける。

```css
border-radius: 16px;
clip-path: inset(0 round 16px);
overflow: hidden;
```

`border-radius` だけでは、ネイティブのドラッグやリサイズ中に合成器が overflow の円を落とす。同半径の `clip-path` で合成を固定する。両方必要で、片方では足りない。

最大化時は両方を消す。残すと画面四隅に透明の欠けが出る。判定はレンダラの推測ではなく、main の `isMaximized` を唯一の源にする。`<html>` に `window-maximized` を付け、次のバリアントで打ち消す。

```css
/* html.platform-linux-desktop.window-maximized 自身と子孫 */
border-radius: 0;
clip-path: inset(0);
```

クラスは起動時に userAgent で付ける。`Mac` なら `platform-mac-desktop`、`Windows` なら `platform-windows-desktop`、どちらでもなければ `platform-linux-desktop`。Web には付けない。

## 6. 内側カード

Linux は常に `border-radius: 12px; border: 1px solid <border>`。四隅すべて。最大化しても消さない。カードはウィンドウ外縁ではない。

Windows:

| `supportsNativeRoundedCorners` | クラス                    | 意味                                                                |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------- |
| `null`（未取得・bridge 失敗）  | 四隅 5px + 枠             | 不明を Win10 と決め打ちしない。Win11 が直角のまま残るのを避ける     |
| `false`（build < 22000）       | 左だけ 5px + 枠は四辺残す | 右外角を丸めると、直角の Win10 に存在しないウィンドウ外形を偽造する |
| `true`                         | 四隅 5px + 枠             | 4px 隙間があるので、最大化でも半径と枠を残す                        |

macOS は 26 以上で 12px、それ以外と不明で 6px。どちらも四辺の枠付き。

サイドペインが開いているときの会話欄と端末は、上の Windows 10 特例を通さず、CSS 変数の内側半径（Windows なら四隅 5px）を直接使う。閉じているときだけ上表のクラスを使う。移植時にこの分岐を潰さない。

設定ページのコンテンツ枠は同じ 4px 隙間。半径は Windows 5px、それ以外 12px。Win10 の「右だけ直角」は設定ページには無い。

## 7. レイアウト

デスクトップ（3 OS とも）:

```
シェル
├─ サイドバー幅: 可変。余白も半径も無し。上に高さ 48px のドラッグ帯
├─ ハンドル幅 4px（w-1）。ヒットは全面、表示線だけ上下を handleIndicatorInset で短くする
└─ コンテンツ列
   ├─ 上 4px のドラッグ帯
   ├─ 右 4px、下 4px（padding。左と上は 0）
   └─ カード（半径 + 枠 + 不透明背景）
```

サイドバーを畳んでも幅を 0 にしない。4px を残し、カードがウィンドウ左縁に吸着しないようにする。Web はこの隙間が 0。

サイドペインと端末が同時に見えるときは、会話カードの下半径と端末カードの上半径を内側半径に戻し、接する辺の枠を残す。離れたカードが一つの角で繋がって見えないようにするため。

## 8. main から renderer へ渡す状態

```ts
interface DesktopWindowChromeState {
  isMaximized: boolean;
  macOSMajorVersion: number | null; // 非 macOS、解析不能は null
  supportsNativeRoundedCorners: boolean; // win32 かつ build >= 22000 のみ true
}
```

macOS 版の換算: Darwin major が 25 以上なら `major + 1`（Tahoe は 26）。それ未満は `major - 9`。古い「常に Darwin - 9」は Tahoe を壊す。

送るタイミングは `maximize`、`unmaximize`、および renderer からの初回問い合わせ。購読を先に張り、問い合わせ結果が後から来ても、その間に起きたイベントを上書きしない。起動時に既に最大化されている場合、イベントだけでは初回状態が欠ける。

## 9. ドラッグとウィンドウボタン

`frame: false` の Windows / Linux は、ドラッグ領域を自分で置く。CSS は `-webkit-app-region: drag` と `no-drag`。ボタン、メニュー、リサイズハンドル、ダイアログは必ず `no-drag`。ドラッグ帯の上にボタンを重ねるとクリックがドラッグに吸われる。

| OS      | ボタン                                                     | ドラッグ                                                           |
| ------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| macOS   | ネイティブ信号機。自絵しない                               | シェル上端とヘッダ。信号機の左 96px は空ける                       |
| Windows | 最小化・最大化・閉じるを renderer で描く。幅の目安は 136px | 同左。ボタン領域は `no-drag`                                       |
| Linux   | Windows と同じ自絵ボタン                                   | 同左。`autoHideMenuBar` を忘れるとネイティブメニューがもう一列出る |

ボタン操作は renderer が状態を持たず、main へ最小化・最大化切替・閉じるを送る。最大化アイコンは同じ `isMaximized` で復元アイコンに切り替える。

## 10. 移植手順

1. OS ごとに BrowserWindow オプションを分ける。Linux だけ `transparent: true`。macOS は `titleBarStyle: "hidden"` のまま。Windows は `frame: false` と `backgroundMaterial: "acrylic"`。
1. `html, body, #root` を透明にする。不透明色はシェル以降に塗る。
1. Linux のシェルに 16px の `border-radius` と同一半径の `clip-path` を両方付ける。最大化で両方消す。
1. 内側カードは別要素。4px 離し、OS 別半径と 1px 枠を付ける。サイドバーには半径を付けない。
1. ウィンドウ状態は main の `isMaximized` だけを見る。レンダラで画面サイズから推測しない。
1. Win11 判定は build 22000 以上。未取得は Win10 扱いにしない。
1. macOS 版は Darwin 26 対応の換算を使う。不明は 6px。
1. 自絵ボタンとドラッグ領域を `no-drag` で分離する。

## 11. 崩し方

- Linux で `transparent` を外すと、切った四隅が直角の黒に戻る。
- `border-radius` だけで `clip-path` を省くと、ドラッグ中に角が欠ける。
- 最大化後も Linux の 16px を残すと、画面四隅が透明に欠ける。
- 最大化でカード半径まで消すと、4px 隙間の内側が突然直角になる。
- Windows の内側を 12px にすると、角の溝が厚い弧になる。
- macOS を `frame: false` にすると、信号機とネイティブ角を自分で再実装することになる。現行はそれをしない。
- Linux だけ `hasShadow: false` を他 OS に広げる必要はない。逆に Linux で戻すと、環境によって外縁の黒線が出る。
- サイドバーに中央カードと同じ半径を付けると、この画面の見た目ではなくなる。左の丸みは外枠のクリップである。
