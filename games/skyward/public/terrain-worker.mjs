import {terrainHeight} from './terrain.mjs';
import {buildSceneTerrain,packTerrainGeometry,colorSoftwareTerrain} from './terrain-visuals.mjs';

self.onmessage=event=>{
  const job=event.data,mesh=buildSceneTerrain({...job,sampleHeight:(x,z)=>terrainHeight(x,z,job.mission)});
  if(job.software){colorSoftwareTerrain(mesh,job.mission,job.palette);self.postMessage({key:job.key,quality:job.quality,mesh},[mesh.colors.buffer]);}
  else{
    const geometry=packTerrainGeometry(mesh,job.mission,job.palette),state={anchorX:mesh.anchorX,anchorZ:mesh.anchorZ,cell:mesh.cell,focusStep:mesh.focusStep,triangles:mesh.triangles};
    self.postMessage({key:job.key,quality:job.quality,mesh:state,geometry},Object.values(geometry).map(attribute=>attribute.buffer));
  }
};
