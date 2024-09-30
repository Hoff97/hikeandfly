mkdir ./data

cd data

downloadZip () {
    wget http://viewfinderpanoramas.org/dem$2/$1.zip
    unzip $1.zip
    mv $1/*.hgt ./
    rm $1.zip
    rm -rf $1/
}

# Europe

echo "===================================================="
echo ""
echo ""
echo "Europe"
echo ""
echo ""
echo "===================================================="

downloadZip "N29" "1"
downloadZip "N30" "1"
downloadZip "N31" "1"
downloadZip "N32" "1"
downloadZip "N33" "1"
downloadZip "N34" "1"
downloadZip "N35" "1"

downloadZip "M29" "1"
downloadZip "M30" "1"
downloadZip "M31" "1"
downloadZip "M32" "1"
downloadZip "M33" "1"
downloadZip "M34" "1"
downloadZip "M35" "1"

downloadZip "L30" "1"
downloadZip "L31" "1"
downloadZip "L32" "1"
downloadZip "L33" "1"
downloadZip "L34" "1"
downloadZip "L35" "1"

downloadZip "K29" "1"
downloadZip "K30" "1"
downloadZip "K31" "1"
downloadZip "K32" "1"
downloadZip "K33" "1"
downloadZip "K34" "1"
downloadZip "K35" "1"

downloadZip "J29" "1"
downloadZip "J30" "1"
downloadZip "J31" "1"
downloadZip "J32" "1"
downloadZip "J33" "1"
downloadZip "J34" "1"
downloadZip "J35" "1"


# North america

echo "===================================================="
echo ""
echo ""
echo "North america"
echo ""
echo ""
echo "===================================================="

downloadZip "N08" "1"
downloadZip "N09" "1"
downloadZip "N10" "1"
downloadZip "N11" "1"
downloadZip "N12" "1"
downloadZip "N13" "1"
downloadZip "N14" "1"

downloadZip "M09" "1"
downloadZip "N10" "1"
downloadZip "N11" "1"
downloadZip "N12" "1"
downloadZip "N13" "1"
downloadZip "N14" "1"

downloadZip "L10" "1"
downloadZip "L11" "1"
downloadZip "L12" "1"
downloadZip "L13" "1"
downloadZip "L14" "1"

downloadZip "K10" "1"
downloadZip "K11" "1"
downloadZip "K12" "1"
downloadZip "K13" "1"
downloadZip "K14" "1"

downloadZip "J10" "1"
downloadZip "J11" "1"
downloadZip "J12" "1"
downloadZip "J13" "1"
downloadZip "J14" "1"

downloadZip "I10" "1"
downloadZip "I11" "1"
downloadZip "I12" "1"
downloadZip "I13" "1"
downloadZip "I14" "1"

downloadZip "E11" "1"
downloadZip "E12" "1"
downloadZip "E13" "1"
downloadZip "E14" "1"

downloadZip "F12" "1"
downloadZip "F13" "1"
downloadZip "F14" "1"

downloadZip "G11" "1"
downloadZip "G12" "1"
downloadZip "G13" "1"
downloadZip "G14" "1"

downloadZip "H11" "1"
downloadZip "H12" "1"
downloadZip "H13" "1"
downloadZip "H14" "1"


# Himalaya

echo "===================================================="
echo ""
echo ""
echo "Himalaya"
echo ""
echo ""
echo "===================================================="

downloadZip "G42" "3"
downloadZip "G43" "3"
downloadZip "G44" "3"
downloadZip "G45" "3"
downloadZip "G46" "3"
downloadZip "G47" "3"
downloadZip "G48" "3"

downloadZip "H42" "3"
downloadZip "H43" "3"
downloadZip "H44" "3"
downloadZip "H45" "3"
downloadZip "H46" "3"
downloadZip "H47" "3"
downloadZip "H48" "3"

downloadZip "I42" "3"
downloadZip "I43" "3"
downloadZip "I44" "3"
downloadZip "I45" "3"
downloadZip "I46" "3"
downloadZip "I47" "3"
downloadZip "I48" "3"

downloadZip "J42" "3"
downloadZip "J43" "3"
downloadZip "J44" "3"
downloadZip "J45" "3"
downloadZip "J46" "3"
downloadZip "J47" "3"
downloadZip "J48" "3"

downloadZip "K42" "3"
downloadZip "K43" "3"
downloadZip "K44" "3"
downloadZip "K45" "3"
downloadZip "K46" "3"
downloadZip "K47" "3"
downloadZip "K48" "3"

downloadZip "L42" "3"
downloadZip "L43" "3"
downloadZip "L44" "3"
downloadZip "L45" "3"
downloadZip "L46" "3"
downloadZip "L47" "3"
downloadZip "L48" "3"
