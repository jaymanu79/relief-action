#include <stdio.h>

int main() {
FILE *f,*out;
unsigned char buf1[800000],buf2[800000];
char filename[50];
int t,p,n,a,idx=1;
unsigned char previous=0,cle;
int delta,curs=0;
int crib[5]={2,-1,5,1,2};
f=fopen("piece18.sna","rb");
if (f) {
	n=fread(buf1,1,800000,f);
	fclose(f);
	printf("LUS %d \n",n);
	f=fopen("piece19.sna","rb");
	n=fread(buf2,1,800000,f);
	fclose(f);
	printf("LUS %d \n",n);

	for(t=0x100;t<0xC000+0x100;t+=1) {

	if(buf2[t]==buf1[t]+1) {
		printf("Adr &%04x %02x\n",t-0x100,buf2[t]);
	}
}
}
else {
	printf("ERror opening\n");
}
}
