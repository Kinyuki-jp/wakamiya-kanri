/**
 * 若宮こういち後援会 - 一般登録受付プロキシ (Google Apps Script)
 *
 * このスクリプトは、サイト（GitHub Pages）から送られてきた一般登録データを
 * GitHubの supporters.json に追記するための中継サーバーです。
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * セットアップ手順
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 1. https://script.google.com を開く
 * 2. 「新しいプロジェクト」をクリック
 * 3. 既定の関数 myFunction を全て削除し、このコードを全て貼り付ける
 * 4. 左メニュー「プロジェクトの設定」(歯車アイコン)
 *    → 「スクリプト プロパティ」セクション
 *    → 「スクリプト プロパティを追加」を押し、以下3つを登録:
 *        ┌────────────────┬─────────────────────────────────┐
 *        │ プロパティ        │ 値                                │
 *        ├────────────────┼─────────────────────────────────┤
 *        │ GITHUB_TOKEN    │ ghp_xxxxx... (あなたのトークン)     │
 *        │ GITHUB_REPO     │ Kinyuki-jp/wakamiya-kanri        │
 *        │ GITHUB_FILE     │ supporters.json                  │
 *        └────────────────┴─────────────────────────────────┘
 * 5. 右上「デプロイ」→「新しいデプロイ」
 *    - 種類の選択: ウェブアプリ
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 *    - 「デプロイ」を押す
 * 6. 表示された「ウェブアプリ URL」(https://script.google.com/macros/s/.../exec) をコピー
 * 7. サイトの管理画面 → 設定 → 「Googleフォーム連携」欄に貼り付けて保存
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const PROPS = PropertiesService.getScriptProperties();

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 入力バリデーション
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return jsonResponse({ ok: false, error: '名前は必須です' });
    }
    if (data.name.length > 100) {
      return jsonResponse({ ok: false, error: '名前が長すぎます' });
    }

    const token = PROPS.getProperty('GITHUB_TOKEN');
    const repo = PROPS.getProperty('GITHUB_REPO') || 'Kinyuki-jp/wakamiya-kanri';
    const file = PROPS.getProperty('GITHUB_FILE') || 'supporters.json';

    if (!token) {
      return jsonResponse({ ok: false, error: 'サーバー設定不備（管理者に連絡）' });
    }

    const apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + file;

    // 現在の supporters.json を取得
    const getResp = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json'
      },
      muteHttpExceptions: true
    });

    if (getResp.getResponseCode() !== 200) {
      return jsonResponse({ ok: false, error: 'GitHub取得失敗' });
    }

    const fileData = JSON.parse(getResp.getContentText());
    const sha = fileData.sha;
    const decoded = Utilities.newBlob(Utilities.base64Decode(fileData.content)).getDataAsString();
    const payload = JSON.parse(decoded);
    const supporters = payload.supporters || [];

    // 新規データを作成
    const now = new Date().toISOString();
    const newSupporter = {
      id: Date.now().toString(),
      name: String(data.name).trim().slice(0, 100),
      area: String(data.area || 'その他').slice(0, 30),
      tel: String(data.tel || '').trim().slice(0, 30),
      relation: '一般登録',
      level: '支持者',
      note: String(data.note || '').slice(0, 500),
      email: '',
      age: '',
      gender: '',
      addr: '',
      source: 'general-form',
      created: now,
      updated: now
    };
    supporters.unshift(newSupporter);

    // GitHubへ書き込み
    const newPayload = {
      version: 2,
      updated: now,
      supporters: supporters
    };
    const newContent = Utilities.base64Encode(
      Utilities.newBlob(JSON.stringify(newPayload, null, 2)).getBytes()
    );

    const putResp = UrlFetchApp.fetch(apiUrl, {
      method: 'put',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json'
      },
      contentType: 'application/json',
      payload: JSON.stringify({
        message: '一般登録: ' + newSupporter.name,
        content: newContent,
        sha: sha
      }),
      muteHttpExceptions: true
    });

    const code = putResp.getResponseCode();
    if (code >= 200 && code < 300) {
      return jsonResponse({ ok: true, id: newSupporter.id, count: supporters.length });
    } else {
      return jsonResponse({ ok: false, error: 'GitHub書き込み失敗 (HTTP ' + code + ')' });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  return jsonResponse({ ok: true, message: '若宮こういち後援会 登録受付プロキシ稼働中' });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
