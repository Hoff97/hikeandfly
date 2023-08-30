mkdir ./data

cd data

wget http://viewfinderpanoramas.org/dem1/M32.zip
wget http://viewfinderpanoramas.org/dem1/M33.zip
wget http://viewfinderpanoramas.org/dem1/L31.zip
wget http://viewfinderpanoramas.org/dem1/L32.zip
wget http://viewfinderpanoramas.org/dem1/L33.zip

unzip M32.zip
unzip M33.zip
unzip L31.zip
unzip L32.zip
unzip L33.zip

mv M32/*.hgt ./
mv M33/*.hgt ./
mv L31/*.hgt ./
mv L32/*.hgt ./
mv L33/*.hgt ./