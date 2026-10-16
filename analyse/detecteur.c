#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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

unsigned char buf[800000];
int dstart=0xB9F0;

int makeLigne(char *out,int ncase,int val, int mode){
	int addr=dstart+ncase*8;
	if (val==1) addr+=(9*8);
	unsigned char byte=buf[addr+0x100];
	if(mode==1) {
			for(int t=1;t<=8;t++) { 
				if(byte & 0b00000001) sprintf (out+strlen(out),"\u2588"); else sprintf (out+strlen(out)," ");	
				printf("\naddr=%04X t=%d %02X\n%s\n",addr,t,byte,out);			
				byte=byte>>1;
			}
	}
}

char *makeDetect(unsigned char piece, int mode) {
	char *out=malloc(1000);
	sprintf(out,"");
	makeLigne(out,0,0,mode);
	makeLigne(out,1,0,mode);
	makeLigne(out,2,0,mode);
	sprintf(out+strlen(out),"\n");
	makeLigne(out,3,0,mode);
	makeLigne(out,4,0,mode);
	makeLigne(out,5,0,mode);
	sprintf(out+strlen(out),"\n");
	makeLigne(out,6,0,mode);
	makeLigne(out,7,0,mode);
	makeLigne(out,8,0,mode);
	sprintf(out+strlen(out),"\n");
	return(out);
	} 


int main() {
FILE *f,*out;
int n;


/*f=fopen("dernier.SNA","rb");*/
/*f=fopen("orig.dsk","rb");*/
/*f=fopen("epilogue.sna","rb");**/
f=fopen("txtastrog.sna","rb");
/*f=fopen("test","rb");*/
if (f) {
	n=fread(buf,1,800000,f);
	fclose(f);
printf("LUS %d \n",n);

char *detecteur;
detecteur=makeDetect(0,1);
printf("Detecteur 0\n%s",detecteur);
		
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
}
else {
	printf("ERror opening\n");
}
}
