; whisper-model-installer.exe — ブラウザ内 Whisper 音声認識(P2-α、
; docs/SPEECH_RECOGNITION_REDESIGN.md)用の ONNX モデルを取得する
; スタンドアロンのGUIインストーラー(2026-08-29新設)。
;
; open-english 本体のインストーラー(open-english.iss)からも
; [Tasks] "installwhispermodel" として同じ fetch-whisper-model.ps1 を
; 呼べるが、あとから単体でモデルだけ追加/更新したい利用者向けに
; この .exe も用意する(命名規約 <name>-installer.exe に合わせる)。
;
; PrivilegesRequired=lowest — 管理者権限は不要。既定の取得先は
; %LOCALAPPDATA%\Programs\open-english\models(open-english 本体の
; 既定インストール先の models サブフォルダ)。

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0-local-build"
#endif

[Setup]
AppName=open-english Whisper model
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\open-english\models
DefaultGroupName=open-english
DisableProgramGroupPage=yes
DisableDirPage=no
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=whisper-model-installer
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
Uninstallable=no

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "fetch-whisper-model.ps1"; DestDir: "{tmp}"; Flags: dontcopy deleteafterinstall

[Run]
; インストール先(=モデルを置くフォルダ)を DestDir として ps1 を実行。
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\fetch-whisper-model.ps1"" -DestDir ""{app}"""; \
  StatusMsg: "Downloading the Whisper speech-recognition model (~40-80 MB)..."; \
  Flags: runhidden waituntilterminated

[Messages]
FinishedLabel=The Whisper model has been placed under:%n%n    {app}%n%nopen-english will use it for higher-accuracy voice input on WebGPU-capable browsers (Chrome/Edge). If the download did not finish, open-english keeps working with the built-in Web Speech API and you can re-run this installer later.
