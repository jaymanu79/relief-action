#include <stdio.h>

int printbyte(unsigned char byte) {
		if(byte & 0b10000000) printf ("\u2588"); else printf (" ");
		if(byte & 0b01000000) printf ("\u2588"); else printf (" ");
		if(byte & 0b00100000) printf ("\u2588"); else printf (" ");
		if(byte & 0b00010000) printf ("\u2588"); else printf (" ");
		if(byte & 0b00001000) printf ("\u2588"); else printf (" ");
		if(byte & 0b00000100) printf ("\u2588"); else printf (" ");
		if(byte & 0b00000010) printf ("\u2588"); else printf (" ");
		if(byte & 0b00000001) printf ("\u2588"); else printf (" ");
	return(0);
	}

int printbytePPM(FILE *f,unsigned char byte) {
		if(byte & 0b10000000) fprintf (f,"1 "); else fprintf (f,"0 ");
		if(byte & 0b01000000) fprintf (f,"1 "); else fprintf (f,"0 ");
		if(byte & 0b00100000) fprintf (f,"1 "); else fprintf (f,"0 ");
		if(byte & 0b00010000) fprintf (f,"1 "); else fprintf (f,"0 ");
		if(byte & 0b00001000) fprintf (f,"1 "); else fprintf (f,"0 ");
		if(byte & 0b00000100) fprintf (f,"1 "); else fprintf (f,"0 ");
		if(byte & 0b00000010) fprintf (f,"1 "); else fprintf (f,"0 ");
		if(byte & 0b00000001) fprintf (f,"1 "); else fprintf (f,"0 ");
		fprintf (f,"\n");
	return(0);
	}



int main() {
FILE *f,*out;
unsigned char buf[800000];
char filename[50];
int t,p,n,a,idx=1;
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
	for(t=0xB668+0x100;t<0xbe27+0x100;t+=8) {

	printf("\n\ID %d nAdr %02x\n",idx,t-0x100);

		
		for(p=0;p<=7;p++) {
		printbyte (buf[t+p]);
		printf("\n");
		}
	sprintf(filename,"gra%03d.ppm",idx);
/*	out=fopen(filename,"w");
	fprintf(out,"P1\n# Index %03d at memory %04x\n8 8\n",idx,t-0x100);
	for(p=0;p<=7;p++) {
		printbytePPM (out,buf[t+p]);
		}	
	fclose(out);
	sprintf(filename,"pnmtopng gra%03d.ppm >gra%03d.png\n",idx,idx);
	system(filename);
	sprintf(filename,"rm gra%03d.ppm\n",idx);
	system(filename);
*/
	idx++;
}
}
else {
	printf("ERror opening\n");
}
}
