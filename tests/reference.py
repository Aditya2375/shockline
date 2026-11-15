"""Independent scalar recurrence and direct closed-form forecast vs Java."""
import subprocess,json,math
n=0;maxdiff=0
def eq(a,b):
 global n,maxdiff
 n+=1
 if a is None or isinstance(a,(str,bool)):assert a==b;return
 diff=abs(a-b)/max(1,abs(a));maxdiff=max(maxdiff,diff);assert diff<1e-12,(a,b)
for seed in[1,2,2026,2147483648,4294967295]:
 for mode in['seeded','positive','negative']:
  for a,b,v in[(.08,.88,.01),(0,0,.005),(0,.98,.03),(.3,.69,.03),(.01,0,.02)]:
   data=json.loads(subprocess.check_output(['java','-cp','build/classes','Dump',str(seed),mode,str(a),str(b),str(v)]));x=seed;z=[]
   for i in range(360):
    for direction,k in [('l',13),('r',17),('l',5)]:x=(x^((x<<k)if direction=='l'else(x>>k)))&0xffffffff
    z.append((x/2**32*2-1)*math.sqrt(3))
   if mode!='seeded':z[180]=4 if mode=='positive'else-4
   omega=v*v*(1-a-b);h=v*v
   eq(data['omega'],omega);eq(data['persistence'],a+b);eq(data['halfLife'],None if a+b==0 else math.log(.5)/math.log(a+b))
   for i in range(360):
    sigma=math.sqrt(h);e=sigma*z[i];shock=a*e*e;persist=b*h;next_h=omega+shock+persist
    expected=dict(period=i+1,innovation=z[i],variance=h,volatility=sigma,residual=e,omega=omega,shockTerm=shock,persistenceTerm=persist,nextVariance=next_h,nextVolatility=math.sqrt(next_h))
    for k,value in expected.items():eq(data['rows'][i][k],value)
    h=next_h
print(n,'independent Python PRNG/conditional variance/innovation/algebra checks maxscaled',maxdiff)

for a,b,v in[(.08,.88,.01),(0,0,.005),(.3,.69,.03)]:
 for h in[.000001,.0001,.01,1e200]:
  data=json.loads(subprocess.check_output(['java','-cp','build/classes','Dump','forecast',str(h),str(a),str(b),str(v)]))
  for k,row in enumerate(data):
   expected=v*v+(a+b)**k*(h-v*v)
   eq(row['horizon'],k+1);eq(row['variance'],expected);eq(row['rootExpectedVariance'],math.sqrt(expected))
print(n,'total independent Python checks including closed form forecasts maxscaled',maxdiff)
