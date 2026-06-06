' Cubric Studio Vision - default launcher (no terminal window).
' Double-click this to start the app with no console window. If you need
' to see console output for diagnostics, use start-with-terminal.bat
' instead.
Option Explicit
Dim shell, fso, here, batPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(here, "start-with-terminal.bat")
' 0 = hidden window, False = do not wait for the process to finish.
shell.Run """" & batPath & """", 0, False
