// Engineering replacement of native C shader; not an unmodified Stitch export.
export const vertex=`#version 300 es
layout(location=0) in vec2 a_position;
out vec2 uv;
void main(){uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
export const background=`#version 300 es
precision highp float;
in vec2 uv;uniform sampler2D source;out vec4 color;
void main(){color=texture(source,uv);}`;
export const fragment=`#version 300 es
precision highp float;
in vec2 uv;out vec4 color;
uniform sampler2D backdrop;uniform vec2 size;
uniform vec4 shape;uniform float shapeRadius;uniform bool isNav;uniform bool isBank;uniform bool dispersion;
float sdRound(vec2 p,vec4 r,float radius){vec2 q=abs(p-r.xy-r.zw*.5)-(r.zw*.5-vec2(radius));return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;}
float heightAt(vec2 p,vec4 r,float radius,float bevel,float thickness,float curvature){
 float taper=smoothstep(0.,bevel,-sdRound(p,r,radius));
 vec2 q=(p-r.xy-r.zw*.5)/(r.zw*.5);
 float dome=1.-curvature+curvature*sqrt(max(0.,1.-clamp(q.y*q.y+.10*q.x*q.x,0.,1.)));
 return thickness*taper*dome;
}
vec3 bg(vec2 css,float lod){vec2 tc=vec2(css.x/size.x,1.-css.y/size.y);vec2 margin=.5/vec2(textureSize(backdrop,0));return textureLod(backdrop,clamp(tc,margin,1.-margin),lod).rgb;}
bool bend(vec3 I,vec3 N,float eta,out vec3 R){float ni=dot(N,I);float k=1.-eta*eta*(1.-ni*ni);if(k<0.){R=vec3(0.);return false;}R=eta*I-(eta*ni+sqrt(k))*N;return true;}
// Front z=h, planar back z=0, controlled background z=-gap. All units CSS px.
// This is two Snell interfaces and finite ray advancement, not normal.xy distortion.
vec3 trace(vec2 p,float h,vec3 N,float ior,float gap,float edge){
 vec3 inside;vec3 I=vec3(0.,0.,-1.);
 if(!bend(I,N,1./ior,inside)||inside.z>=-.0001)return bg(p,1.);
 vec3 back=vec3(p,h)+inside*(-h/inside.z);
 vec3 outgoing;
 // Back geometric outward normal is -z. Snell's routine needs +z facing inside ray.
 if(!bend(inside,vec3(0.,0.,1.),ior,outgoing)||outgoing.z>=-.0001){
   vec3 reflected=reflect(inside,vec3(0.,0.,1.));
   return bg(p+reflected.xy*8.,1.); // Explicit TIR fallback; never normalize(0).
 }
 vec2 hit=back.xy+outgoing.xy*(-gap/outgoing.z);
 float faceWeight=1.-.45*edge;float innerWeight=.35*smoothstep(.18,.75,edge)*(1.-smoothstep(.85,1.,edge));float outerWeight=.20*smoothstep(.60,1.,edge);
 vec3 face=bg(hit,.4*edge);
 vec3 inner=bg(mix(hit,back.xy,.25),1.5);
 vec3 outer=bg(p+reflect(I,N).xy*7.,.75);
 return (face*faceWeight+inner*innerWeight+outer*outerWeight)/(faceWeight+innerWeight+outerWeight);
}
void main(){
 vec2 p=vec2(uv.x,1.-uv.y)*size;
 vec4 result=vec4(0.);
 {
  vec4 r=shape;float radius=shapeRadius;
  float d=sdRound(p,r,radius);float aa=max(fwidth(d),.45);if(d>24.){color=vec4(0.);return;}
  float coverage=1.-smoothstep(-aa,aa,d);
  float shadowD=sdRound(p-vec2(0.,4.),r,radius);
  float shadow=.065*exp(-max(shadowD,0.)/7.)*(1.-coverage);
  if(shadow>result.a)result=vec4(vec3(.29,.38,.55)*shadow,shadow);
  if(coverage<=0.){color=result;return;}
  // R7 bank environment reflection adapted from the actual Stitch preview.
  // It is reflection of a controlled studio environment, not DOM refraction.
  if(isBank){
    vec2 vUv=vec2((p.x-r.x)/r.z,1.-(p.y-r.y)/r.w);
    vec3 N=normalize(vec3((vUv-.5)*.32,1.2));
    vec3 I=normalize(vec3(.1,-.25,-.9));
    vec3 R=reflect(I,N);vec2 q=R.xy/max(R.z,.2);
    vec2 envUv=vUv+.12*q;
    float lum1=smoothstep(.1,.8,1.-length(envUv-vec2(.3,.85)));
    float lum2=smoothstep(.0,.9,1.-length(envUv-vec2(.75,.2)));
    vec3 ink=vec3(.075,.088,.12);
    vec3 studio=lum1*vec3(.243,.388,.867)*.11+lum2*vec3(.85,.90,1.)*.12;
    float rim=exp(-pow((d+1.)/.9,2.));
    vec3 material=ink+studio+rim*.10*clamp(.7-vUv.x+vUv.y*.3,0.,1.);
    result=mix(result,vec4(material,1.),coverage);color=result;return;
  }
  float bevel=!isNav?15.:10.5;float thickness=!isNav?9.:11.;float gap=!isNav?26.:48.;
  // Both native C surfaces now have a gentle center curve; do not use a flat-face shortcut.
  float h=heightAt(p,r,radius,bevel,thickness,!isNav?.12:.65);
  float e=.65;
  float dx=(heightAt(p+vec2(e,0.),r,radius,bevel,thickness,!isNav?.12:.65)-heightAt(p-vec2(e,0.),r,radius,bevel,thickness,!isNav?.12:.65))/(2.*e);
  float dy=(heightAt(p+vec2(0.,e),r,radius,bevel,thickness,!isNav?.12:.65)-heightAt(p-vec2(0.,e),r,radius,bevel,thickness,!isNav?.12:.65))/(2.*e);
  vec3 N=normalize(vec3(-dx,-dy,1.));
  float edge=1.-smoothstep(0.,bevel,-d);
  vec3 transmitted=trace(p,h,N,1.46,gap,edge);
  if(dispersion&&edge>.02){vec3 red=trace(p,h,N,1.457,gap,edge);vec3 blue=trace(p,h,N,1.463,gap,edge);transmitted=mix(transmitted,vec3(red.r,transmitted.g,blue.b),edge);}
  float f0=pow((1.46-1.)/(1.46+1.),2.);
  float fresnel=f0+(1.-f0)*pow(1.-max(N.z,0.),5.);
  vec3 reflection=bg(p+reflect(vec3(0.,0.,-1.),N).xy*14.,1.);
  vec3 material=mix(transmitted,reflection,fresnel);
  vec3 light=normalize(vec3(-.5,-.65,1.));vec3 halfV=normalize(light+vec3(0.,0.,1.));
  float spec=pow(max(dot(N,halfV),0.),62.)*edge*.34;
  material+=vec3(spec);
  // Thin internal rim follows the bevel normal and lighting, not a painted border.
  if(isNav){
   float rim=exp(-pow((-d-2.1)/1.3,2.));
   float facing=dot(N.xy,normalize(vec2(-.5,-.65)));
   material+=vec3(.11)*rim*max(facing,0.);
   material*=1.-.10*rim*max(-facing,0.);
  }
  material*=1.-(!isNav?.025:.045)*edge;
  result=mix(result,vec4(material,1.),coverage);
 }
 color=result;
}`;

export async function makeBackground(width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
 const angle=132*Math.PI/180,dx=Math.sin(angle),dy=-Math.cos(angle),length=Math.abs(width*dx)+Math.abs(height*dy);
 const g=ctx.createLinearGradient(width/2-dx*length/2,height/2-dy*length/2,width/2+dx*length/2,height/2+dy*length/2);
 [[0,'#e7f0ff'],[.49,'#cbdcff'],[.8,'#eef5fd'],[1,'#d8e4ff']].forEach(([p,c])=>g.addColorStop(p,c));ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
 function radial(x,y,rx,ry,color,stop){ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);const q=ctx.createRadialGradient(0,0,0,0,0,1);q.addColorStop(0,color);q.addColorStop(stop,'rgba(238,247,255,0)');ctx.fillStyle=q;ctx.fillRect(-2,-2,4,4);ctx.restore();}
 radial(0,height*.68,width*1.414,height*.68*1.414,'#eef7ff',.63);
 radial(width*.87,height*.12,width*.87*1.414,height*.88*1.414,'#c8d9ff99',.6);
 const art=new Image();art.src=new URL('./controlled-background.svg',import.meta.url).href;await art.decode();ctx.drawImage(art,0,0,width,height);return canvas;
}
