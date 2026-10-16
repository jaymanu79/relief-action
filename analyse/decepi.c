#include <stdio.h>
#include <string.h>
int main() {
	FILE *f;
	unsigned char buf[800000];
	int t,n,i,chainidx=1,caridx=0;
	int bit1,bit2,bit3;
	int startidx,endidx;
	int nospace=0;
	int phraseend=0;
	int finish=0;
	unsigned char c,letter,number;
	int stringid;
	int DEBUG=0;
	char chaines[200][200];
	char curchain[200];
	/*f=fopen("dernier.SNA","rb");*/
/*	f=fopen("orig.dsk","rb");*/
	f=fopen("epilogue.sna","rb");
	
	/*f=fopen("test","rb");*/
	if (f) {
		n=fread(buf,1,800000,f);
		fclose(f);
		memset(curchain,'\0',sizeof(curchain));
		endidx=137410;

		t=0x99A; /* start of string zone in RELIEF.BAS */
		
		/* ********* READING STRING ZONE ************** */
		
		printf("\n *** Loading strings ***\n\n");
		
		while(buf[t]!=0x60) { /* string zone ends with 060 */

			c=buf[t];
			letter=(c&0x1F)+0x40; /* a-z */
			bit1=(c&0x80);
			bit2=(c&0x40);
			bit3=(c&0x20);

			if(letter==0x40) letter=' ';
			if(letter==0x5B) letter=0x27; /* ' */
			if(letter==0x5C) letter=0x2D; /* - */
			if(letter==0x5D) letter='x'; /* unused */
			if(letter==0x5F) letter='!';
			if(c==0x9E) letter='?'; /* point interrog */
			if(c==0xAB) letter = '*'; /* diamond character in game */
		
							
				if(!bit1 && !bit2 && bit3) { /* mode chiffre */
					number=(c&0x1F)+0x2F;
					if (number==0x2F) number='.';
					if(number>0x39) {
						/*printf("(%02x)",c);*/
					} else {
						curchain[caridx++]=number;
					}
				} else {
					 /* mode lettre */
					curchain[caridx++]=letter;
					}
				
			if(bit1) { /* NEXT string, bit 1 is separator */
				startidx=endidx+1;
				endidx=t;
				strcpy(chaines[chainidx],curchain);
				memset(curchain,'\0',sizeof(curchain));
				caridx=0;					
				printf("Chaine %d : %s",chainidx,chaines[chainidx]);
				if (DEBUG) {printf (" | ");for(i=startidx;i<=endidx;i++) {
						printf("%02X ",buf[i]);
					}
				}
				printf("\n");
				chainidx++;
			}
		
		t++;
	}
	
		/* ********* READING PHRASE ZONE ************** */
		printf("\n *** Assembling strings ***\n\n");

	t++;
	chainidx=0;
	memset(curchain,'\0',sizeof(curchain));
	endidx=t-1;
	caridx=0;
	for(;t<n && !finish;t++) {
			
			caridx=strlen(curchain);
			c=buf[t];

			if (c==0x38) { /* guessing zone end with value absent from zone */
					finish=1;
				}

			if (c==0x1E) { /* mode NOSPACE */
				nospace=1;				
			}
		
			else { 
				if (c==0x20 || phraseend) { /* end of phrase */
					chainidx++;
					startidx=endidx+1;
					endidx=t;
					printf("Phrase %d : %s",chainidx,curchain);
					memset(curchain,'\0',sizeof(curchain));					
					if (DEBUG) {
						printf(" | ");
						for(i=startidx;i<=endidx;i++) {
							printf("%02X ",buf[i]);
						}
					}
					printf("\n");
					
					if(phraseend) {
						phraseend=0;
						t--;
					}
				} 
				
				else {		
					if(c<0x80) {/* mode caractere */
						letter=(c&0x1F)+0x40; /* a-z */
						bit1=(c&0x80);
						bit2=(c&0x40);
						bit3=(c&0x20);
					
						if(letter==0x40) letter=' ';
						if(letter==0x5B) letter=0x27; /* ' */
						if(letter==0x5C) letter=0x2D; /* - */
						if(letter==0x5D) letter='x'; /* unused */
						if(letter==0x5F) letter='!';
						
						if(buf[t-1]==0x00 && buf[t-2]!=0x00 && buf[t-2]!=0x80) { /* mode chiffre PHRASE */
								curchain[caridx--]=0x00; /* remove space created by 00 */
								number=c&0x07; /* 3 last bits */
								if (number==00) {
									letter = '#';
								} else {
									letter = number+0x2F;
								}
							}
							
						if(!bit1 && !bit2 && bit3) { /* mode chiffre (que pour chaines)*/
							number=(c&0x1F)+0x2F;
						if(number>0x39) {
							printf("(%02x)",c);
							finish=1;
						} else {
							curchain[caridx]=number;
							caridx=strlen(curchain);
						}
					} else {
						 /* mode lettre */
						curchain[caridx++]=letter;
						if (bit2 && buf[t+1]!=0x1b && buf[t+1]!=0x1c) { 
							strcat(curchain," ");
							caridx=strlen(curchain);}
						
						if (bit3) {
						  phraseend=1;
						  }
						}
					}
					
					else { /* mode CHAINE */
							if(c==0x80) { /* pour n°chaine >255 */
								t++;
								if (buf[t]>=128) {
									stringid=(int)buf[t];
									phraseend=1;
								} else {
									stringid=(int)buf[t]+128;
								}
							} else {			
								stringid=buf[t]-128;
							}
							
							if (nospace==1 ) {
								curchain[caridx-1]='\0';
								nospace=0; 
							}
							if(DEBUG) strcat(curchain,"[");
							strcat(curchain,chaines[stringid]);
							if(DEBUG) strcat(curchain,"]");
							if(buf[t+1]!=0x1b && buf[t+1]!=0x1c) {
								strcat(curchain," "); }
							caridx=strlen(curchain);
					}
				}
			}
					
		}
		
	} else {
		printf("Error opening\n");
		}
		}
	
