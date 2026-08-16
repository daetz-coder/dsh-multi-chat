' gateway-hidden.vbs — launch the authenticated gateway with NO console window.
' Uses WScript.Shell.Run(..., 0, false) so no conhost window ever flashes.
'
' Usage:
'   wscript.exe "D:\2026AppDev\dsh-plugins-multi-task\scripts\gateway-hidden.vbs"
'
' Or, to run with custom values, edit the constants below.
' The node process is detached (second Run arg = false), so it outlives this
' script. The hidden-window flag (0) keeps it fully invisible.

Option Explicit

' ---- config ----
Dim port, target, token, name
port   = 8443
target = "127.0.0.1:3070"
token  = "dsh2026"
name   = "DSH"
' ----------------

Dim fso, shell, scriptAbs
Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Absolute path to gateway.mjs, resolved relative to THIS script file.
scriptAbs = fso.GetParentFolderName(WScript.ScriptFullName) & "\gateway.mjs"

' Quote the path defensively (spaces etc.).
scriptAbs = """" & scriptAbs & """"

Dim cmd
cmd = "node " & scriptAbs & " --target " & target & " --listen 0.0.0.0:" & CStr(port) & " --token " & token & " --name " & name

' 0 = hidden window, false = don't wait for it to finish.
shell.Run cmd, 0, false
