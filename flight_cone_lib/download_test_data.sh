mkdir ./data

cd data

downloadZip () {
    local folder="${3:-$1}"
    wget http://viewfinderpanoramas.org/dem$2/$1.zip
    unzip $1.zip
    mv $folder/*.hgt ./
    rm $1.zip
    rm -rf $folder/
}

downloadZip "L32" "1"
downloadZip "L33" "1"
