rm .\mailSilver.zip
# 第一步：本地打包（PowerShell里输）
Compress-Archive -Path .\mailSilver -DestinationPath .\mailSilver.zip

# 第二步：传压缩包（更快！）
scp -P 23322 -C .\mailSilver.zip zocsrd_deploy@arrow.kt.sb:/www/wwwroot/zocsrd/__node_project/mail/

# 第三步：登录服务器解压（SSH登录后输）
ssh -p 23322 zocsrd_deploy@arrow.kt.sb "cd /www/wwwroot/zocsrd/__node_project/mail/ && unzip -o mailSilver.zip && cd mailSilver && npm install && echo ok"
# unzip /www/wwwroot/zocsrd/__node_project/mail/mailSilver.zip -d /www/wwwroot/zocsrd/__node_project/mail/
# cd /www/wwwroot/zocsrd/__node_project/mail/
# unzip mailSilver.zip
# cd mailSilver
# npm install
# exit