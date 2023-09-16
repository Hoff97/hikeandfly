mkdir ./data

cd data

wget http://viewfinderpanoramas.org/dem1/M32.zip
wget http://viewfinderpanoramas.org/dem1/M33.zip
wget http://viewfinderpanoramas.org/dem1/L31.zip
wget http://viewfinderpanoramas.org/dem1/L32.zip
wget http://viewfinderpanoramas.org/dem1/L33.zip
wget http://viewfinderpanoramas.org/dem1/K32.zip
wget http://viewfinderpanoramas.org/dem1/J32.zip

unzip M32.zip
unzip M33.zip
unzip L31.zip
unzip L32.zip
unzip L33.zip
unzip K32.zip
unzip J32.zip

mv M32/*.hgt ./
mv M33/*.hgt ./
mv L31/*.hgt ./
mv L32/*.hgt ./
mv L33/*.hgt ./
mv K32/*.hgt ./
mv J32/*.hgt ./

rm M32.zip M33.zip L31.zip L32.zip L33.zip K32.zip J32.zip
