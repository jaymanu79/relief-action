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
f=fopen("epilogue.sna","rb");
/*f=fopen("test","rb");*/
if (f) {
	n=fread(buf,1,800000,f);
	fclose(f);
printf("LUS %d \n",n);
	for(t=0;t<n;t++) {
	delta=buf[t]-previous;
	/* printf("%d ",delta); */
	if (delta==crib[curs]) {
		curs++;
		if(curs==1) {
			cle=previous;
		}
		/*printf ("%d ",curs);*/
		if (curs==4) {
		printf ("\n CRIB AT %d cle %d\n",t,cle);
			curs=0;
		}
	}
	else
	{
		curs=0;
	}
	previous=buf[t];
	}
}
else {
	printf("ERror opening\n");
}
}
