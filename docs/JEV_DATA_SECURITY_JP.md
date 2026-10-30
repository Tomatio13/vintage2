# Jevへ送信するデータのセキュリティ方針

VINTAGEはAgent Monitorの状態判定を有効にした場合、terminal出力の末尾をTypeSafe Jevへ送信します。API keyを設定していない場合、Jev evaluatorは作成されず外部送信しません。

## 送信範囲

- terminal出力は末尾40行、合計4,000文字まで
- commandは最大1,000文字まで
- Workspaceの完全なpathは送らず、末尾のdirectory名だけを送る
- status hint、終了code、経過時間、foreground process名などの状態情報を送る

## 送信前に除去する情報

- `secret`、`token`、`password`、`api_key`、`access_key`などを名前に含む代入値
- Bearer tokenとJWT
- AWS、GitHub、Slack、OpenAI互換、Google形式の既知token
- PEM private key block
- HTTP(S) URLのuserinfo
- command引数内の同種credential
- ANSI/OSC制御sequence

## 残余リスク

redactionは既知patternに対するbest-effort処理です。任意の名前、独自形式、分割表示、難読化された秘密情報を完全には検出できません。秘密値をterminalへ出力しないことが基本対策です。新しいcredential形式を扱う場合はredaction fixtureを追加します。

Debug logには送信本文を記録せず、hash、行数、所要時間、判定結果だけを記録します。
