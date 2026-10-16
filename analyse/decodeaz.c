#include <stdio.h>

int main() {
FILE *f;
unsigned char buf[800000];
int t,n;
unsigned char previous=0,cle;
int delta,curs=0;
int crib[5]={2,-1,5,1,2};
/*f=fopen("dernier.SNA","rb");*/
/*f=fopen("orig.dsk","rb");*/
/*f=fopen("epilogue.sna","rb");**/
f=fopen("txtastrog.sna","rb");
/*f=fopen("test","rb");*/
if (f) {
	n=fread(buf,1,800000,f);
	fclose(f);
printf("LUS %d \n",n);
	for(t=0/*18826*/;t<n;t++) {
				
	if (buf[t]==0x60 && buf[t+1]==0x84 && buf[t+3]==0xb5 && buf[t+4]==0x9e) printf("\nADRESSE %d\n",t); 
	
	if(buf[t]<=0x1a) {
		printf("%c",'A' + buf[t] -1);
	} else {
		if(buf[t]>=0x40 && buf[t]<=0x5f) {
			printf("%c[_]",buf[t]-0x41+'A');
		} else {
			if(buf[t]>=0x80 && buf[t]<=0x9a) {
				printf("%c (adr %d)\n",buf[t]-0x81+'A',t+1);
			} else {
					printf(" %02x ",buf[t]);
			}
		}
	}
}
}
else {
	printf("ERror opening\n");
}
}
