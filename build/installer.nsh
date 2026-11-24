!macro customInstall
  ; Mobil personel telefonlarinin kasaya (port 3000) baglanabilmesi icin Windows Guvenlik Duvari izni
  nsExec::Exec 'netsh advfirewall firewall delete rule name="DROJE POS Mobil"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="DROJE POS Mobil" dir=in action=allow protocol=TCP localport=3000 profile=any enable=yes'
  nsExec::Exec 'netsh advfirewall firewall add rule name="DROJE POS Mobil" dir=in action=allow program="$INSTDIR\DROJE POS.exe" profile=any enable=yes'
!macroend
