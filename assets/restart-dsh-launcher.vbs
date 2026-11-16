' Restart launcher for DSH. Launched by explorer.exe: running the .cmd through
' explorer escapes the DSH process tree, so the restart script is not killed
' together with DSH. Runs restart-dsh.cmd hidden from the same folder.
' NOTE: keep this file ASCII-only. The VBS host may read scripts with a legacy
' ANSI code page, so UTF-8 comments would turn into mojibake.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & dir & "\restart-dsh.cmd""", 0, False
